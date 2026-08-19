import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

const schema = z.object({
  status: z.enum(["CONFIRMADO", "RECUSADO", "CANCELADO", "CONCLUIDO"]),
});

// De onde cada status pode partir — evita, por ex., reabrir um agendamento
// já concluído ou confirmar de novo algo que já foi recusado.
const TRANSICOES_PERMITIDAS: Record<string, string[]> = {
  CONFIRMADO: ["PENDENTE"],
  RECUSADO: ["PENDENTE"],
  CONCLUIDO: ["CONFIRMADO"],
  CANCELADO: ["PENDENTE", "CONFIRMADO"],
};

// PATCH: só o barbeiro dono do agendamento pode confirmar/recusar.
// É essa a regra pedida: "quem confirma é apenas o barbeiro".
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const agendamento = await db.agendamento.findUnique({ where: { id: params.id } });
  if (!agendamento || agendamento.barbeiroId !== sessao.usuarioId) {
    return NextResponse.json({ erro: "Agendamento não encontrado" }, { status: 404 });
  }

  const dados = schema.safeParse(await req.json());
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  if (!TRANSICOES_PERMITIDAS[dados.data.status].includes(agendamento.status)) {
    return NextResponse.json({ erro: "Esse agendamento não pode mudar para esse status" }, { status: 409 });
  }

  // CONCLUIDO entra na soma do financeiro (ver /api/financeiro) — não pode
  // ser marcado antes do horário realmente acontecer, senão conta
  // faturamento de um atendimento que ainda nem ocorreu.
  if (dados.data.status === "CONCLUIDO" && agendamento.data > new Date()) {
    return NextResponse.json({ erro: "Esse agendamento ainda não aconteceu" }, { status: 409 });
  }

  const atualizado = await db.agendamento.update({
    where: { id: params.id },
    data: { status: dados.data.status },
  });

  return NextResponse.json({ agendamento: atualizado });
}
