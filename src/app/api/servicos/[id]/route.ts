import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

const schema = z.object({
  nome: z.string().min(2).optional(),
  precoBase: z.number().positive().optional(),
  duracaoMinutos: z.number().int().positive().optional(),
  ativo: z.boolean().optional(),
  imagemUrl: z.string().url().optional(),
});

async function garantirDono(id: string, barbeariaId: string) {
  const servico = await db.servico.findUnique({ where: { id }, include: { barbeiros: true } });
  return servico && servico.barbeariaId === barbeariaId ? servico : null;
}

// PATCH: mesma regra de permissão do DELETE abaixo — dono edita qualquer
// corte da barbearia; barbeiro só edita um corte que seja exclusivamente
// dele (ver garantirDono/ehSoDele).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const existente = await garantirDono(params.id, sessao.barbeariaId!);
  if (!existente) return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });

  if (sessao.papel === "BARBEIRO") {
    const ehSoDele = existente.barbeiros.length === 1 && existente.barbeiros[0].barbeiroId === sessao.usuarioId;
    if (!ehSoDele) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const dados = schema.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const servico = await db.servico.update({ where: { id: params.id }, data: dados.data });
  return NextResponse.json({ servico });
}

// DELETE: o DONO pode excluir (desativar) qualquer corte da barbearia. Um
// BARBEIRO (ou DONO com atendeComoBarbeiro) só pode excluir um corte que
// seja exclusivamente dele — ver regra de negócio 5: corte criado por
// barbeiro fica só pra ele, marcado por ter exatamente um ServicoBarbeiro
// apontando pro próprio criador. Um corte de alcance pra barbearia toda
// (criado pelo dono, sem ServicoBarbeiro nenhum) só o dono remove.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const existente = await garantirDono(params.id, sessao.barbeariaId!);
  if (!existente) return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });

  if (sessao.papel === "BARBEIRO") {
    const ehSoDele = existente.barbeiros.length === 1 && existente.barbeiros[0].barbeiroId === sessao.usuarioId;
    if (!ehSoDele) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  // Preferimos desativar a excluir de fato, pra não perder o histórico de
  // agendamentos antigos que referenciam esse serviço.
  await db.servico.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
}
