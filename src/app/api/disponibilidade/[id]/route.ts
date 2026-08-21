import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";
import { schemaDisponibilidade } from "@/lib/validacaoDisponibilidade";

// PATCH: edita uma janela já cadastrada (mudar dia/hora) sem precisar
// excluir e recriar — mesma validação da criação (hora em ponto ou meia,
// início < fim) e a mesma trava contra duplicata (P2002).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["BARBEIRO", "DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const existente = await db.disponibilidade.findUnique({ where: { id: params.id } });
  if (!existente || existente.barbeiroId !== sessao.usuarioId) {
    return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  }

  const dados = schemaDisponibilidade.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  try {
    const disponibilidade = await db.disponibilidade.update({
      where: { id: params.id },
      data: dados.data,
    });
    return NextResponse.json({ disponibilidade });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return NextResponse.json({ erro: "Você já tem esse horário cadastrado nesse dia" }, { status: 409 });
    }
    throw erro;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // BARBEIRO ou DONO que também atende (ver regra de negócio 10) — a
  // checagem de dono da linha logo abaixo já garante que só quem criou
  // consegue remover, então não precisa reconferir atendeComoBarbeiro aqui.
  const sessao = await exigirSessao(["BARBEIRO", "DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const existente = await db.disponibilidade.findUnique({ where: { id: params.id } });
  if (!existente || existente.barbeiroId !== sessao.usuarioId) {
    return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  }

  await db.disponibilidade.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
