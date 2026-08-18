import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

const schema = z.object({
  nome: z.string().min(2).optional(),
  precoBase: z.number().positive().optional(),
  duracaoMinutos: z.number().int().positive().optional(),
  ativo: z.boolean().optional(),
});

async function garantirDono(id: string, barbeariaId: string) {
  const servico = await db.servico.findUnique({ where: { id } });
  return servico && servico.barbeariaId === barbeariaId ? servico : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const existente = await garantirDono(params.id, sessao.barbeariaId!);
  if (!existente) return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });

  const dados = schema.safeParse(await req.json());
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const servico = await db.servico.update({ where: { id: params.id }, data: dados.data });
  return NextResponse.json({ servico });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const existente = await garantirDono(params.id, sessao.barbeariaId!);
  if (!existente) return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });

  // Preferimos desativar a excluir de fato, pra não perder o histórico de
  // agendamentos antigos que referenciam esse serviço.
  await db.servico.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
}
