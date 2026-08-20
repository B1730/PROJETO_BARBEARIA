import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { criarHashSenha, criarSessao, lerTokenConviteBarbeiro } from "@/lib/auth";
import { enviarEmailBoasVindas } from "@/lib/email";

// GET /api/barbeiros/aceitar-convite?token=...
// Só valida o token e devolve os dados pra tela mostrar antes de pedir a
// senha — assim um convite inválido/expirado já aparece como erro claro,
// em vez da pessoa só descobrir isso depois de preencher tudo.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ erro: "Convite inválido" }, { status: 400 });

  const identidade = await lerTokenConviteBarbeiro(token);
  if (!identidade) {
    return NextResponse.json({ erro: "Convite expirado ou inválido — peça pra te convidarem de novo" }, { status: 400 });
  }

  const barbearia = await db.barbearia.findUnique({ where: { id: identidade.barbeariaId }, select: { nome: true } });
  if (!barbearia) return NextResponse.json({ erro: "Convite inválido" }, { status: 400 });

  return NextResponse.json({
    nome: identidade.nome,
    email: identidade.email,
    barbeariaNome: barbearia.nome,
    convidadoPorNome: identidade.convidadoPor,
  });
}

const schema = z.object({
  token: z.string(),
  senha: z.string().min(6),
});

// POST: confirma o convite e cria a conta — só agora o Usuario passa a
// existir. Revalida o token e reconfere o e-mail (corrida: alguém pode ter
// se cadastrado com esse e-mail por outro caminho enquanto o convite
// estava pendente).
export async function POST(req: NextRequest) {
  const dados = schema.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const identidade = await lerTokenConviteBarbeiro(dados.data.token);
  if (!identidade) {
    return NextResponse.json({ erro: "Convite expirado ou inválido — peça pra te convidarem de novo" }, { status: 400 });
  }

  let usuario;
  try {
    usuario = await db.usuario.create({
      data: {
        nome: identidade.nome,
        email: identidade.email,
        senhaHash: await criarHashSenha(dados.data.senha),
        papel: "BARBEIRO",
        ehChefe: false,
        barbeariaId: identidade.barbeariaId,
      },
    });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      // Corrida: alguém já criou essa conta (por outro caminho) enquanto
      // o convite estava pendente — loga na conta que já existe em vez de
      // só devolver um erro, mesmo padrão de google/finalizar/route.ts.
      // Não mexe na senha dela: só o dono da conta que já existe define
      // isso, o convite não pode sobrescrever silenciosamente.
      usuario = await db.usuario.findUniqueOrThrow({ where: { email: identidade.email } });
    } else {
      throw erro;
    }
  }

  await criarSessao({ usuarioId: usuario.id, papel: usuario.papel, barbeariaId: usuario.barbeariaId });

  // Boas-vindas com os dois links que ele vai precisar: o painel dele
  // (login) e a página pública da barbearia (pra divulgar pros próprios
  // clientes). Falha em silêncio — a conta já foi criada e ele já está
  // logado, isso é só um extra.
  const barbearia = await db.barbearia.findUnique({ where: { id: identidade.barbeariaId }, select: { nome: true, slug: true } });
  if (barbearia) {
    await enviarEmailBoasVindas({
      para: identidade.email,
      nome: identidade.nome,
      barbeariaNome: barbearia.nome,
      urlLogin: `${req.nextUrl.origin}/entrar`,
      urlBarbearia: `${req.nextUrl.origin}/${barbearia.slug}`,
    });
  }

  return NextResponse.json({ ok: true });
}
