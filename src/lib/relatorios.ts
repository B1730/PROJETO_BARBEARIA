import { db } from "./db";

// Lógica compartilhada entre GET /api/financeiro (dono/barbeiro) e GET
// /api/admin/financeiro (ADMIN com acesso concedido) — os dois precisam do
// mesmo cálculo de janela de tempo e da mesma agregação, só mudando quem
// tem permissão de chamar e se pode filtrar por um barbeiro específico.

export function calcularJanelaFinanceiro(periodo: string): { inicio: Date; fim: Date } {
  const agora = new Date();
  // "Hoje" precisa ser calculado no fuso de Brasília, não no fuso do
  // processo Node (em produção, Vercel roda em UTC) — senão o corte de
  // "mês"/"ano" pode ficar até 3h errado perto da virada do dia.
  const hojeBrasil = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  const [anoBrasil, mesBrasil, diaBrasil] = hojeBrasil.split("-").map(Number);

  if (periodo === "dia") {
    return {
      inicio: new Date(Date.UTC(anoBrasil, mesBrasil - 1, diaBrasil, 3, 0, 0)),
      fim: new Date(Date.UTC(anoBrasil, mesBrasil - 1, diaBrasil + 1, 3, 0, 0)),
    };
  }
  if (periodo === "ano") {
    return {
      inicio: new Date(Date.UTC(anoBrasil, 0, 1, 3, 0, 0)),
      fim: new Date(Date.UTC(anoBrasil + 1, 0, 1, 3, 0, 0)),
    };
  }
  return {
    inicio: new Date(Date.UTC(anoBrasil, mesBrasil - 1, 1, 3, 0, 0)),
    fim: new Date(Date.UTC(anoBrasil, mesBrasil, 1, 3, 0, 0)),
  };
}

export async function buscarFinanceiro(
  barbeariaId: string,
  inicio: Date,
  fim: Date,
  apenasBarbeiroId?: string
) {
  const where: any = { barbeariaId, status: "CONCLUIDO", data: { gte: inicio, lt: fim } };
  if (apenasBarbeiroId) where.barbeiroId = apenasBarbeiroId;

  const agendamentos = await db.agendamento.findMany({
    where,
    include: { barbeiro: { select: { id: true, nome: true } } },
  });

  const totalGeral = agendamentos.reduce((soma, ag) => soma + Number(ag.precoCobrado), 0);

  const porBarbeiro = new Map<string, { nome: string; total: number; quantidade: number }>();
  for (const ag of agendamentos) {
    const atual = porBarbeiro.get(ag.barbeiroId) || { nome: ag.barbeiro.nome, total: 0, quantidade: 0 };
    atual.total += Number(ag.precoCobrado);
    atual.quantidade += 1;
    porBarbeiro.set(ag.barbeiroId, atual);
  }

  return {
    totalGeral,
    totalDeAtendimentos: agendamentos.length,
    porBarbeiro: Array.from(porBarbeiro.entries()).map(([id, v]) => ({ barbeiroId: id, ...v })),
  };
}

// Lógica compartilhada entre GET /api/relatorio-equipe e
// GET /api/admin/relatorio-equipe — mesmo cálculo, ADMIN sempre chama sem
// apenasBarbeiroId (o acesso concedido é da barbearia inteira, nunca de um
// barbeiro só).

export function calcularJanelaRelatorio(deParam: string | null, ateParam: string | null): { inicio: Date; fim: Date } | null {
  const hojeBrasil = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [anoHoje, mesHoje] = hojeBrasil.split("-").map(Number);

  const [anoDe, mesDe, diaDe] = deParam ? deParam.split("-").map(Number) : [anoHoje, mesHoje, 1];
  const [anoAte, mesAte, diaAte] = ateParam
    ? ateParam.split("-").map(Number)
    : [anoHoje, mesHoje, new Date(anoHoje, mesHoje, 0).getDate()];

  const inicio = new Date(Date.UTC(anoDe, mesDe - 1, diaDe, 3, 0, 0));
  // "ate" é inclusivo (o próprio dia inteiro conta) — por isso o limite
  // real é o início do dia SEGUINTE.
  const fim = new Date(Date.UTC(anoAte, mesAte - 1, diaAte + 1, 3, 0, 0));
  if (fim <= inicio) return null;
  return { inicio, fim };
}

// Só pra comparar dia marcado vs. dia de conclusão (lista de detalhe de
// cortes concluídos) — nunca usado pra filtrar/gravar.
const diaBrasilDe = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function buscarRelatorioEquipe(barbeariaId: string, inicio: Date, fim: Date, apenasBarbeiroId?: string) {
  const whereBarbeiros: any = { barbeariaId, OR: [{ papel: "BARBEIRO" }, { papel: "DONO", atendeComoBarbeiro: true }] };
  if (apenasBarbeiroId) whereBarbeiros.id = apenasBarbeiroId;

  const [barbeiros, porBarbeiroConcluidos, cortesConcluidos, porBarbeiroCancelados, confirmadosNoPeriodo, porBarbeiroTotal, agendamentosConcluidosDetalhe] =
    await Promise.all([
      db.usuario.findMany({ where: whereBarbeiros, select: { id: true, nome: true } }),
      db.agendamento.groupBy({
        by: ["barbeiroId"],
        where: { barbeariaId, status: "CONCLUIDO", data: { gte: inicio, lt: fim } },
        _sum: { precoCobrado: true },
        _count: { _all: true },
      }),
      // "Corte mais feito" por barbeiro: um agendamento pode ter vários
      // cortes (ver AgendamentoServico), então isso não dá mais pra fazer
      // com groupBy direto em Agendamento — groupBy não agrupa por campo
      // de relação (barbeiroId mora em Agendamento, não em
      // AgendamentoServico). Busca as linhas e agrega em memória, mesmo
      // padrão já usado abaixo pro tempo médio de resposta.
      db.agendamentoServico.findMany({
        where: { agendamento: { barbeariaId, status: "CONCLUIDO", data: { gte: inicio, lt: fim } } },
        select: { servicoId: true, nomeServico: true, agendamento: { select: { barbeiroId: true } } },
      }),
      db.agendamento.groupBy({
        by: ["barbeiroId"],
        where: { barbeariaId, status: "CANCELADO", atualizadoEm: { gte: inicio, lt: fim } },
        _count: { _all: true },
      }),
      db.agendamento.findMany({
        where: { barbeariaId, confirmadoEm: { gte: inicio, lt: fim } },
        select: { barbeiroId: true, criadoEm: true, confirmadoEm: true },
      }),
      db.agendamento.groupBy({
        by: ["barbeiroId"],
        where: { barbeariaId, data: { gte: inicio, lt: fim } },
        _count: { _all: true },
      }),
      db.agendamento.findMany({
        where: { barbeariaId, status: "CONCLUIDO", data: { gte: inicio, lt: fim } },
        select: { id: true, barbeiroId: true, data: true, concluidoEm: true, servicos: { select: { nomeServico: true } } },
        orderBy: { data: "desc" },
      }),
    ]);

  const faturamentoMap = new Map(
    porBarbeiroConcluidos.map((r) => [r.barbeiroId, { total: Number(r._sum.precoCobrado ?? 0), quantidade: r._count._all }])
  );

  const contagemPorBarbeiroServico = new Map<string, Map<string, { nome: string; quantidade: number }>>();
  for (const item of cortesConcluidos) {
    const barbeiroId = item.agendamento.barbeiroId;
    const porServico = contagemPorBarbeiroServico.get(barbeiroId) ?? new Map();
    const atual = porServico.get(item.servicoId) ?? { nome: item.nomeServico, quantidade: 0 };
    atual.quantidade += 1;
    porServico.set(item.servicoId, atual);
    contagemPorBarbeiroServico.set(barbeiroId, porServico);
  }
  const corteMaisFeitoMap = new Map<string, { nome: string; quantidade: number }>();
  for (const [barbeiroId, porServico] of contagemPorBarbeiroServico) {
    let melhor: { nome: string; quantidade: number } | null = null;
    for (const v of porServico.values()) {
      if (!melhor || v.quantidade > melhor.quantidade) melhor = v;
    }
    if (melhor) corteMaisFeitoMap.set(barbeiroId, melhor);
  }

  const detalheConcluidosMap = new Map<
    string,
    { id: string; data: Date; concluidoEm: Date | null; nomesCortes: string; divergente: boolean }[]
  >();
  for (const ag of agendamentosConcluidosDetalhe) {
    const lista = detalheConcluidosMap.get(ag.barbeiroId) ?? [];
    lista.push({
      id: ag.id,
      data: ag.data,
      concluidoEm: ag.concluidoEm,
      nomesCortes: ag.servicos.map((s) => s.nomeServico).join(" + "),
      divergente: !!ag.concluidoEm && diaBrasilDe(ag.concluidoEm) !== diaBrasilDe(ag.data),
    });
    detalheConcluidosMap.set(ag.barbeiroId, lista);
  }

  const canceladosMap = new Map(porBarbeiroCancelados.map((r) => [r.barbeiroId, r._count._all]));
  const totalMap = new Map(porBarbeiroTotal.map((r) => [r.barbeiroId, r._count._all]));

  const temposPorBarbeiro = new Map<string, number[]>();
  for (const ag of confirmadosNoPeriodo) {
    if (!ag.confirmadoEm) continue;
    const minutos = (ag.confirmadoEm.getTime() - ag.criadoEm.getTime()) / 60000;
    const lista = temposPorBarbeiro.get(ag.barbeiroId) ?? [];
    lista.push(minutos);
    temposPorBarbeiro.set(ag.barbeiroId, lista);
  }

  return barbeiros.map((b) => {
    const fat = faturamentoMap.get(b.id);
    const tempos = temposPorBarbeiro.get(b.id) ?? [];
    return {
      barbeiroId: b.id,
      nome: b.nome,
      faturamentoBruto: fat?.total ?? 0,
      cortesConcluidos: fat?.quantidade ?? 0,
      corteMaisFeito: corteMaisFeitoMap.get(b.id) ?? null,
      cortesCancelados: canceladosMap.get(b.id) ?? 0,
      totalAgendamentos: totalMap.get(b.id) ?? 0,
      tempoMedioParaAceitarMinutos: tempos.length > 0 ? tempos.reduce((a, c) => a + c, 0) / tempos.length : null,
      pedidosAceitosNoPeriodo: tempos.length,
      cortesConcluidosDetalhe: detalheConcluidosMap.get(b.id) ?? [],
    };
  });
}
