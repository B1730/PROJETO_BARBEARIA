import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { criarSessao, criarTokenGooglePendente, normalizarEmail } from "@/lib/auth";

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
// - se não existe (CLIENTE ou DONO), ainda falta um dado que o Google não
//   fornece — WhatsApp pro CLIENTE (regra de negócio 12, obrigatório) ou
//   nome da barbearia pro DONO — então manda pra uma telinha extra
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

  const emailBruto = payload.email as string | undefined;
  const nome = (payload.name as string | undefined) || emailBruto;
  if (!emailBruto || !payload.email_verified) return erroRedirect("Seu e-mail do Google precisa estar verificado");
  const email = normalizarEmail(emailBruto);

  const usuario = await db.usuario.findUnique({ where: { email } });

  if (!usuario) {
    if (modoEntrar) {
      return erroRedirect("Conta não encontrada — cadastre-se primeiro");
    }

    // "vinculo" amarra o token (que vai numa URL, então pode vazar por
    // histórico do navegador ou log de proxy) ao navegador que realmente
    // completou o login com o Google — sem isso, qualquer um que obtivesse
    // a URL dentro dos 10min conseguiria finalizar o cadastro no lugar da
    // pessoa dona do e-mail. "next" (já validado contra open-redirect na
    // rota que iniciou o login) vai só na querystring — não é sensível, só
    // usado pelo front pra saber aonde mandar o CLIENTE depois de finalizar.
    const vinculo = randomUUID();
    const tokenPendente = await criarTokenGooglePendente({ email, nome: nome!, vinculo, intent });
    const resposta = NextResponse.redirect(
      `${req.nextUrl.origin}/cadastro/finalizar-google?token=${encodeURIComponent(tokenPendente)}&intent=${intent}&next=${encodeURIComponent(proximaRota)}`
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
