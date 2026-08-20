import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";
import { notificarCancelamentoConfirmado } from "@/lib/whatsapp";

// Ou muda o status, ou recusa um pedido de cancelamento em aberto (mantém o
// agendamento como estava) — nunca as duas coisas na mesma requisição.
const schema = z.union([
  z.object({ status: z.enum(["CONFIRMADO", "RECUSADO", "CANCELADO", "CONCLUIDO"]) }),
  z.object({ recusarCancelamento: z.literal(true) }),
]);

// De onde cada status pode partir — evita, por ex., reabrir um agendamento
// já concluído ou confirmar de novo algo que já foi recusado.
const TRANSICOES_PERMITIDAS: Record<string, string[]> = {
  CONFIRMADO: ["PENDENTE"],
  RECUSADO: ["PENDENTE"],
  CONCLUIDO: ["CONFIRMADO"],
  CANCELADO: ["PENDENTE", "CONFIRMADO"],
};

// PATCH: só o barbeiro dono do agendamento pode confirmar/recusar/cancelar.
// É essa a regra pedida: "quem confirma é apenas o barbeiro". Isso vale
// também pra decisão final sobre um pedido de cancelamento do cliente (ver
// POST /api/agendamentos/[id]/cancelar): o barbeiro é quem confirma
// (status vira CANCELADO) ou recusa (mantém o agendamento como estava).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const agendamento = await db.agendamento.findUnique({
    where: { id: params.id },
    include: { cliente: { select: { nome: true } }, servico: { select: { nome: true } } },
  });
  if (!agendamento || agendamento.barbeiroId !== sessao.usuarioId) {
    return NextResponse.json({ erro: "Agendamento não encontrado" }, { status: 404 });
  }

  const dados = schema.safeParse(await req.json());
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  if ("recusarCancelamento" in dados.data) {
    if (!agendamento.cancelamentoSolicitadoEm) {
      return NextResponse.json({ erro: "Não há pedido de cancelamento em aberto" }, { status: 409 });
    }
    const atualizado = await db.agendamento.update({
      where: { id: params.id },
      data: { cancelamentoSolicitadoEm: null, motivoCancelamento: null },
    });
    return NextResponse.json({ agendamento: atualizado });
  }

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
    data: {
      status: dados.data.status,
      // Se ainda tinha um pedido de cancelamento em aberto e o barbeiro
      // cancelou por outro motivo, não faz sentido deixar isso pendurado.
      ...(dados.data.status === "CANCELADO" ? { cancelamentoSolicitadoEm: null, motivoCancelamento: null } : {}),
    },
  });

  if (dados.data.status === "CANCELADO") {
    const barbeiro = await db.usuario.findUnique({
      where: { id: sessao.usuarioId },
      select: { whatsapp: true, callmebotApiKey: true },
    });
    if (barbeiro?.whatsapp && barbeiro.callmebotApiKey) {
      const dataFormatada = agendamento.data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const horaFormatada = agendamento.data.toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      });
      await notificarCancelamentoConfirmado({
        whatsapp: barbeiro.whatsapp,
        apikey: barbeiro.callmebotApiKey,
        mensagem: `Cancelamento confirmado: o agendamento de ${agendamento.servico.nome} com ${agendamento.cliente.nome} em ${dataFormatada} às ${horaFormatada} foi cancelado.`,
      });
    }
  }

  return NextResponse.json({ agendamento: atualizado });
}
