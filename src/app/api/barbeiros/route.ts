import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao, sessaoTemPrivilegioDeChefe } from "@/lib/exigirSessao";
import { criarTokenConviteBarbeiro } from "@/lib/auth";
import { enviarEmailConvite } from "@/lib/email";

const schema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
});

// GET: lista os barbeiros da barbearia do usuário logado (com e-mail —
// dado sensível, só pra dono/chefe, que é quem realmente "gerencia" a
// equipe). Um barbeiro comum que chame isso vê só o próprio registro.
export async function GET() {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const ehChefeOuDono = sessao.papel === "DONO" || (await sessaoTemPrivilegioDeChefe(sessao));

  const barbeiros = await db.usuario.findMany({
    where: {
      barbeariaId: sessao.barbeariaId!,
      papel: "BARBEIRO",
      ...(ehChefeOuDono ? {} : { id: sessao.usuarioId }),
    },
    select: { id: true, nome: true, email: true, criadoEm: true, ehChefe: true },
  });

  return NextResponse.json({ barbeiros });
}

// POST: convida um barbeiro novo por e-mail — não cria a conta na hora.
// Manda um link de confirmação; a conta só existe de fato quando a pessoa
// clica, confirma o e-mail e escolhe a própria senha (ver
// src/app/api/barbeiros/aceitar-convite/route.ts). Quem pode chamar: o
// dono, ou o barbeiro chefe da barbearia "contratando" um barbeiro novo —
// nunca outro barbeiro comum. Quem aceita o convite nunca nasce chefe
// (isso é uma ação separada, só do dono — ver PATCH /api/barbeiros/[id]).
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  if (sessao.papel === "BARBEIRO" && !(await sessaoTemPrivilegioDeChefe(sessao))) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const dados = schema.safeParse(await req.json());
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const jaExiste = await db.usuario.findUnique({ where: { email: dados.data.email } });
  if (jaExiste) {
    return NextResponse.json({ erro: "Este e-mail já está em uso" }, { status: 409 });
  }

  const [convidadoPor, barbearia] = await Promise.all([
    db.usuario.findUnique({ where: { id: sessao.usuarioId }, select: { nome: true } }),
    db.barbearia.findUnique({ where: { id: sessao.barbeariaId! }, select: { nome: true } }),
  ]);
  if (!barbearia) return NextResponse.json({ erro: "Barbearia não encontrada" }, { status: 404 });

  const token = await criarTokenConviteBarbeiro({
    email: dados.data.email,
    nome: dados.data.nome,
    barbeariaId: sessao.barbeariaId!,
    convidadoPor: convidadoPor?.nome ?? "Alguém da equipe",
  });
  const link = `${req.nextUrl.origin}/convite/aceitar?token=${encodeURIComponent(token)}`;

  try {
    await enviarEmailConvite({
      para: dados.data.email,
      nome: dados.data.nome,
      barbeariaNome: barbearia.nome,
      convidadoPorNome: convidadoPor?.nome ?? "Alguém da equipe",
      link,
    });
  } catch (erro) {
    console.error(erro);
    return NextResponse.json({ erro: "Não foi possível enviar o convite, tente de novo" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, email: dados.data.email });
}
