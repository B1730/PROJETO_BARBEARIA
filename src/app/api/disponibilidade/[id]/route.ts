import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const existente = await db.disponibilidade.findUnique({ where: { id: params.id } });
  if (!existente || existente.barbeiroId !== sessao.usuarioId) {
    return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  }

  await db.disponibilidade.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
