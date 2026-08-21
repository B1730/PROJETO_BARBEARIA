import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";
import { notificarCancelamentoConfirmado } from "@/lib/whatsapp";

// Muda o status, recusa um pedido de cancelamento em aberto, ou
// oculta/desoculta um CONCLUIDO/CANCELADO da própria visão — nunca duas
// dessas coisas na mesma requisição.
const schema = z.union([
  z.object({ status: z.enum(["CONFIRMADO", "RECUSADO", "CANCELADO", "CONCLUIDO"]) }),
  z.object({ recusarCancelamento: z.literal(true) }),
  z.object({ ocultar: z.boolean() }),
]);

// De onde cada status pode partir — evita, por ex., reabrir um agendamento
// já concluído ou confirmar de novo algo que já foi recusado.
const TRANSICOES_PERMITIDAS: Record<string, string[]> = {
  CONFIRMADO: ["PENDENTE"],
  RECUSADO: ["PENDENTE"],
  CONCLUIDO: ["CONFIRMADO"],
  CANCELADO: ["PENDENTE", "CONFIRMADO"],
};

// "YYYY-MM-DD" em America/Sao_Paulo — usado só pra comparar dia marcado vs.
// dia de conclusão (nunca pra gravar no banco, que continua em instante
// UTC de verdade).
function diaBrasil(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function dataBrasilFormatada(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// PATCH: só o barbeiro dono do agendamento pode confirmar/recusar/cancelar
// (ou o dono da barbearia, quando o agendamento é dele mesmo — ver regra
// de negócio 10, "atendeComoBarbeiro"; a checagem de dono do agendamento
// logo abaixo já garante isso, então não precisa reconferir o interruptor
// aqui). É essa a regra pedida: "quem confirma é apenas o barbeiro". Isso
// vale também pra decisão final sobre um pedido de cancelamento do
// cliente (ver POST /api/agendamentos/[id]/cancelar): quem confirma
// (status vira CANCELADO) ou recusa (mantém o agendamento como estava) é
// sempre quem está de fato marcado como o barbeiro daquele agendamento —
// nunca o dono agindo por outro barbeiro.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["BARBEIRO", "DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const agendamento = await db.agendamento.findUnique({
    where: { id: params.id },
    include: {
      cliente: { select: { nome: true } },
      servicos: { select: { nomeServico: true } },
      // whatsapp/callmebotApiKey do próprio barbeiro (== sessao.usuarioId,
      // já confirmado logo abaixo) inclusos aqui pra não precisar de uma
      // segunda consulta lá embaixo, na hora de notificar o cancelamento.
      barbeiro: { select: { whatsapp: true, callmebotApiKey: true } },
    },
  });
  if (!agendamento || agendamento.barbeiroId !== sessao.usuarioId) {
    return NextResponse.json({ erro: "Agendamento não encontrado" }, { status: 404 });
  }

  const dados = schema.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  if ("ocultar" in dados.data) {
    if (!["CONCLUIDO", "CANCELADO"].includes(agendamento.status)) {
      return NextResponse.json({ erro: "Só dá pra ocultar um corte concluído ou cancelado" }, { status: 409 });
    }
    const atualizado = await db.agendamento.update({
      where: { id: params.id },
      data: { ocultoPeloBarbeiro: dados.data.ocultar },
    });
    return NextResponse.json({ agendamento: atualizado });
  }

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

  // Decisão deliberada do usuário: o barbeiro pode marcar como CONCLUIDO
  // mesmo antes do horário marcado (ou em outro dia qualquer) — o cliente
  // pode ter ido atender em outro momento combinado informalmente. Já
  // existiu uma trava aqui bloqueando isso (CONCLUIDO só depois do
  // horário passar), removida de propósito a pedido do usuário.

  // Quando a conclusão acontece num dia diferente do agendado (antes OU
  // depois — o objetivo é visibilidade de qualquer divergência, não só
  // antecipação), observacoes recebe um texto automático — nunca editável
  // pelo barbeiro, é só um registro do sistema. Continua null quando os
  // dias batem.
  const agora = new Date();
  const concluindoComDivergencia =
    dados.data.status === "CONCLUIDO" && diaBrasil(agora) !== diaBrasil(agendamento.data);

  const atualizado = await db.agendamento.update({
    where: { id: params.id },
    data: {
      status: dados.data.status,
      // Qualquer decisão manual de status supera um pedido de cancelamento
      // em aberto — sem isso, confirmar/recusar diretamente (em vez de usar
      // recusarCancelamento) deixava os dois campos pendurados, e pra
      // CANCELADO isso travava o cliente pra sempre (POST .../cancelar
      // rejeita com 409 sempre que já existe um pedido em aberto).
      cancelamentoSolicitadoEm: null,
      motivoCancelamento: null,
      // Marca só na primeira vez que vira CONFIRMADO — usado pelo relatório
      // de desempenho do chefe (tempo de demora pra aceitar, ver
      // GET /api/relatorio-equipe). TRANSICOES_PERMITIDAS já garante que só
      // se chega em CONFIRMADO vindo de PENDENTE, então isso nunca sobrescreve.
      ...(dados.data.status === "CONFIRMADO" ? { confirmadoEm: new Date() } : {}),
      // Mesmo padrão de confirmadoEm: só na primeira vez que vira CONCLUIDO
      // (TRANSICOES_PERMITIDAS só permite chegar aqui vindo de CONFIRMADO,
      // e nada transiciona a partir de CONCLUIDO).
      ...(dados.data.status === "CONCLUIDO"
        ? {
            concluidoEm: agora,
            ...(concluindoComDivergencia
              ? { observacoes: `Concluído em ${dataBrasilFormatada(agora)} — agendado para ${dataBrasilFormatada(agendamento.data)}.` }
              : {}),
          }
        : {}),
    },
  });

  if (dados.data.status === "CANCELADO") {
    const barbeiro = agendamento.barbeiro;
    if (barbeiro?.whatsapp && barbeiro.callmebotApiKey) {
      const dataFormatada = agendamento.data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const horaFormatada = agendamento.data.toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      });
      const nomesCortes = agendamento.servicos.map((s) => s.nomeServico).join(" + ");
      await notificarCancelamentoConfirmado({
        whatsapp: barbeiro.whatsapp,
        apikey: barbeiro.callmebotApiKey,
        mensagem: `Cancelamento confirmado: o agendamento de ${nomesCortes} com ${agendamento.cliente.nome} em ${dataFormatada} às ${horaFormatada} foi cancelado.`,
      });
    }
  }

  return NextResponse.json({ agendamento: atualizado });
}
