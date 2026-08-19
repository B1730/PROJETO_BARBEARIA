import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { criarSessao, criarTokenGooglePendente } from "@/lib/auth";

const COOKIE_ESTADO = "google_oauth_estado";
const COOKIE_VINCULO = "google_pendente_vinculo";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

// GET /api/auth/google/callback — o Google chama isso depois do usuário
// aceitar o consentimento. Troca o "code" por um id_token, confere a
// assinatura do Google, e:
// - se já existe conta com esse e-mail, loga como ela (não importa o intent
//   original — evita duplicar conta de quem já tinha se cadastrado antes).
// - se não existe e veio do modo "entrar" (tela de Entrar), NÃO cria nada —
//   volta pra /entrar com "Conta não encontrada". Entrar não cadastra.
// - se não existe e o intent era CLIENTE (veio da tela de Cadastro), cria
//   como cliente na hora (o Google já dá tudo que precisa: nome e e-mail).
// - se não existe e o intent era DONO, ainda falta o nome da barbearia — o
//   Google não fornece isso, então manda pra uma telinha extra
//   (/cadastro/finalizar-google) só com esse campo.
export async function GET(req: NextRequest) {
  const erroRedirect = (motivo: string) =>
    NextResponse.redirect(`${req.nextUrl.origin}/entrar?erro=${encodeURIComponent(motivo)}`);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return erroRedirect("Login com Google não está configurado");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieBruto = req.cookies.get(COOKIE_ESTADO)?.value;
  if (!code || !state || !cookieBruto) return erroRedirect("Sessão de login expirada, tente de novo");

  let proximaRota = "/";
  let intent: "CLIENTE" | "DONO" = "CLIENTE";
  let modoEntrar = false;
  try {
    const { estado, next, intent: intentSalvo, modoEntrar: modoSalvo } = JSON.parse(cookieBruto);
    if (estado !== state) return erroRedirect("Sessão de login inválida, tente de novo");
    if (typeof next === "string") proximaRota = next;
    if (intentSalvo === "DONO") intent = "DONO";
    if (modoSalvo === true) modoEntrar = true;
  } catch {
    return erroRedirect("Sessão de login inválida, tente de novo");
  }

  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;

  const trocaResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!trocaResp.ok) return erroRedirect("Não foi possível confirmar o login com o Google");

  const tokens = await trocaResp.json();
  if (!tokens.id_token) return erroRedirect("Não foi possível confirmar o login com o Google");

  let payload;
  try {
    const resultado = await jwtVerify(tokens.id_token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    payload = resultado.payload;
  } catch {
    return erroRedirect("Não foi possível confirmar o login com o Google");
  }

  const email = payload.email as string | undefined;
  const nome = (payload.name as string | undefined) || email;
  if (!email || !payload.email_verified) return erroRedirect("Seu e-mail do Google precisa estar verificado");

  const usuario = await db.usuario.findUnique({ where: { email } });

  if (!usuario) {
    if (modoEntrar) {
      return erroRedirect("Conta não encontrada — cadastre-se primeiro");
    }

    if (intent === "DONO") {
      // "vinculo" amarra o token (que vai numa URL, então pode vazar por
      // histórico do navegador ou log de proxy) ao navegador que realmente
      // completou o login com o Google — sem isso, qualquer um que
      // obtivesse a URL dentro dos 10min conseguiria finalizar o cadastro
      // no lugar da pessoa dona do e-mail.
      const vinculo = randomUUID();
      const tokenPendente = await criarTokenGooglePendente({ email, nome: nome!, vinculo });
      const resposta = NextResponse.redirect(
        `${req.nextUrl.origin}/cadastro/finalizar-google?token=${encodeURIComponent(tokenPendente)}`
      );
      resposta.cookies.delete(COOKIE_ESTADO);
      resposta.cookies.set(COOKIE_VINCULO, vinculo, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 10,
        path: "/api/auth/google/finalizar",
      });
      return resposta;
    }

    let novoCliente;
    try {
      novoCliente = await db.usuario.create({
        data: { nome: nome!, email, papel: "CLIENTE", senhaHash: null },
      });
    } catch (erro) {
      // Corrida: outra requisição criou a conta desse e-mail entre o
      // findUnique de cima e esse create (ex.: duplo clique, duas abas).
      // Loga na conta que já existe em vez de devolver um 500 cru.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        novoCliente = await db.usuario.findUniqueOrThrow({ where: { email } });
      } else {
        throw erro;
      }
    }
    await criarSessao({ usuarioId: novoCliente.id, papel: novoCliente.papel, barbeariaId: novoCliente.barbeariaId });
    const resposta = NextResponse.redirect(`${req.nextUrl.origin}${proximaRota}`);
    resposta.cookies.delete(COOKIE_ESTADO);
    return resposta;
  }

  await criarSessao({
    usuarioId: usuario.id,
    papel: usuario.papel,
    barbeariaId: usuario.barbeariaId,
  });

  const destino = usuario.papel === "DONO" ? "/admin" : usuario.papel === "BARBEIRO" ? "/barbeiro" : proximaRota;
  const resposta = NextResponse.redirect(`${req.nextUrl.origin}${destino}`);
  resposta.cookies.delete(COOKIE_ESTADO);
  return resposta;
}
