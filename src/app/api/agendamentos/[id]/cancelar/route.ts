import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";
import { notificarCancelamentoDireto, notificarSolicitacaoCancelamento } from "@/lib/whatsapp";

const schema = z.object({
  motivo: z.string().trim().max(300).optional(),
});

// POST: o CLIENTE dono do agendamento cancela.
// - PENDENTE: o barbeiro ainda nem aceitou, então não tem o que decidir —
//   cancela na hora (status vira CANCELADO direto), só avisando o barbeiro
//   por WhatsApp.
// - CONFIRMADO: o barbeiro já se comprometeu com aquele horário, então
//   isso NÃO cancela na hora — só marca `cancelamentoSolicitadoEm` e avisa
//   o barbeiro, pra ele poder falar com o cliente e entender o motivo
//   antes de decidir (ver PATCH /api/agendamentos/[id] pra confirmar ou
//   manter). Continua ocupando o horário normalmente enquanto o pedido
//   está em aberto.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["CLIENTE"]);
  if (sessao instanceof NextResponse) return sessao;

  const agendamento = await db.agendamento.findUnique({
    where: { id: params.id },
    include: {
      barbeiro: { select: { nome: true, whatsapp: true, callmebotApiKey: true } },
      servico: { select: { nome: true } },
      cliente: { select: { nome: true } },
    },
  });
  if (!agendamento || agendamento.clienteId !== sessao.usuarioId) {
    return NextResponse.json({ erro: "Agendamento não encontrado" }, { status: 404 });
  }

  if (!["PENDENTE", "CONFIRMADO"].includes(agendamento.status)) {
    return NextResponse.json({ erro: "Esse agendamento não pode mais ser cancelado" }, { status: 409 });
  }
  if (agendamento.cancelamentoSolicitadoEm) {
    return NextResponse.json({ erro: "Você já pediu para cancelar esse agendamento" }, { status: 409 });
  }

  const dados = schema.safeParse(await req.json().catch(() => ({})));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  // Sem quebra de linha na mensagem que vai pro WhatsApp do barbeiro.
  const motivo = dados.data.motivo?.replace(/[\r\n]+/g, " ").trim() || null;

  const { barbeiro, servico, cliente } = agendamento;
  const dataFormatada = agendamento.data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const horaFormatada = agendamento.data.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (agendamento.status === "PENDENTE") {
    // updateMany com a mesma condição repetida no where — fecha a corrida
    // de duas requisições simultâneas (ex.: duplo clique), mesmo padrão já
    // usado no ramo de CONFIRMADO logo abaixo.
    const resultado = await db.agendamento.updateMany({
      where: { id: params.id, status: "PENDENTE" },
      data: { status: "CANCELADO", motivoCancelamento: motivo },
    });
    if (resultado.count === 0) {
      return NextResponse.json({ erro: "Esse agendamento não pode mais ser cancelado" }, { status: 409 });
    }
    if (barbeiro.whatsapp && barbeiro.callmebotApiKey) {
      await notificarCancelamentoDireto({
        whatsapp: barbeiro.whatsapp,
        apikey: barbeiro.callmebotApiKey,
        mensagem: `${cliente?.nome ?? "Um cliente"} cancelou o pedido de ${servico.nome} de ${dataFormatada} às ${horaFormatada} antes de você confirmar.`,
      });
    }
    return NextResponse.json({ ok: true });
  }

  // CONFIRMADO: updateMany (não update) com a mesma condição já checada
  // acima repetida no `where` — fecha a corrida de duas requisições
  // simultâneas pra esse mesmo agendamento: sem isso, a checagem "sem
  // pedido em aberto" lá em cima e essa escrita eram dois passos
  // separados, e ambas podiam passar na checagem antes de qualquer uma
  // escrever, mandando duas notificações de WhatsApp duplicadas pro
  // barbeiro.
  const resultado = await db.agendamento.updateMany({
    where: { id: params.id, cancelamentoSolicitadoEm: null, status: "CONFIRMADO" },
    data: { cancelamentoSolicitadoEm: new Date(), motivoCancelamento: motivo },
  });
  if (resultado.count === 0) {
    return NextResponse.json({ erro: "Esse agendamento não pode mais ser cancelado" }, { status: 409 });
  }

  if (barbeiro.whatsapp && barbeiro.callmebotApiKey) {
    await notificarSolicitacaoCancelamento({
      whatsapp: barbeiro.whatsapp,
      apikey: barbeiro.callmebotApiKey,
      mensagem: `Pedido de cancelamento: ${cliente?.nome ?? "um cliente"} quer cancelar ${servico.nome} de ${dataFormatada} às ${horaFormatada}. Motivo: ${motivo ?? "não informado"}. Entre em contato com o cliente pra entender antes de decidir, ou acesse o painel pra confirmar ou manter o agendamento.`,
    });
  }

  return NextResponse.json({ ok: true });
}
