import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao, sessaoTemPrivilegioDeChefe } from "@/lib/exigirSessao";

// GET /api/relatorio-equipe?de=2026-08-01&ate=2026-08-31
// Só o barbeiro chefe (ou o dono, que já tem privilégio equivalente de
// chefe em todo lugar do app — ver sessaoTemPrivilegioDeChefe) pode ver
// isso. Período é um intervalo livre de datas (não um enum fixo tipo
// dia/mês/ano do /api/financeiro) — cobre "um dia", "várias semanas",
// "vários meses" ou "um ano inteiro" com a mesma lógica, sem precisar de
// um caminho de código pra cada granularidade. Sem ?de/?ate, cai no mês
// corrente (mesmo padrão do período "mes" de /api/financeiro).
export async function GET(req: NextRequest) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;
  if (!(await sessaoTemPrivilegioDeChefe(sessao))) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const deParam = req.nextUrl.searchParams.get("de");
  const ateParam = req.nextUrl.searchParams.get("ate");
  if ((deParam && !/^\d{4}-\d{2}-\d{2}$/.test(deParam)) || (ateParam && !/^\d{4}-\d{2}-\d{2}$/.test(ateParam))) {
    return NextResponse.json({ erro: "Data inválida" }, { status: 400 });
  }

  // Fuso fixo em America/Sao_Paulo, mesmo critério de /api/financeiro e
  // src/lib/horarios.ts — "de"/"ate" são dias no fuso de Brasília, não UTC.
  const hojeBrasil = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [anoHoje, mesHoje] = hojeBrasil.split("-").map(Number);

  const [anoDe, mesDe, diaDe] = deParam ? deParam.split("-").map(Number) : [anoHoje, mesHoje, 1];
  const [anoAte, mesAte, diaAte] = ateParam ? ateParam.split("-").map(Number) : [anoHoje, mesHoje, new Date(anoHoje, mesHoje, 0).getDate()];

  const inicio = new Date(Date.UTC(anoDe, mesDe - 1, diaDe, 3, 0, 0));
  // "ate" é inclusivo (o próprio dia inteiro conta) — por isso o limite
  // real é o início do dia SEGUINTE.
  const fim = new Date(Date.UTC(anoAte, mesAte - 1, diaAte + 1, 3, 0, 0));
  if (fim <= inicio) {
    return NextResponse.json({ erro: "O período final precisa ser depois do inicial" }, { status: 400 });
  }

  const barbeariaId = sessao.barbeariaId!;

  const [barbeiros, porBarbeiroConcluidos, cortesConcluidos, porBarbeiroCancelados, confirmadosNoPeriodo] =
    await Promise.all([
      // BARBEIRO sempre entra; DONO só se "também atende" (regra de negócio 10).
      db.usuario.findMany({
        where: { barbeariaId, OR: [{ papel: "BARBEIRO" }, { papel: "DONO", atendeComoBarbeiro: true }] },
        select: { id: true, nome: true },
      }),
      db.agendamento.groupBy({
        by: ["barbeiroId"],
        where: { barbeariaId, status: "CONCLUIDO", data: { gte: inicio, lt: fim } },
        _sum: { precoCobrado: true },
        _count: { _all: true },
      }),
      // "Corte mais feito" por barbeiro: um agendamento pode ter vários
      // cortes (ver AgendamentoServico), então isso não dá mais pra fazer
      // com groupBy direto em Agendamento — groupBy não agrupa por campo de
      // relação (barbeiroId mora em Agendamento, não em AgendamentoServico).
      // Busca as linhas e agrega em memória, mesmo padrão já usado abaixo
      // pro tempo médio de resposta.
      db.agendamentoServico.findMany({
        where: { agendamento: { barbeariaId, status: "CONCLUIDO", data: { gte: inicio, lt: fim } } },
        select: { servicoId: true, nomeServico: true, agendamento: { select: { barbeiroId: true } } },
      }),
      // CANCELADO é terminal (nada transiciona a partir dele) — atualizadoEm
      // reflete de forma confiável o momento do cancelamento em si, então
      // não precisa de um campo dedicado tipo confirmadoEm pra esse caso.
      db.agendamento.groupBy({
        by: ["barbeiroId"],
        where: { barbeariaId, status: "CANCELADO", atualizadoEm: { gte: inicio, lt: fim } },
        _count: { _all: true },
      }),
      db.agendamento.findMany({
        where: { barbeariaId, confirmadoEm: { gte: inicio, lt: fim } },
        select: { barbeiroId: true, criadoEm: true, confirmadoEm: true },
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

  const canceladosMap = new Map(porBarbeiroCancelados.map((r) => [r.barbeiroId, r._count._all]));

  const temposPorBarbeiro = new Map<string, number[]>();
  for (const ag of confirmadosNoPeriodo) {
    if (!ag.confirmadoEm) continue;
    const minutos = (ag.confirmadoEm.getTime() - ag.criadoEm.getTime()) / 60000;
    const lista = temposPorBarbeiro.get(ag.barbeiroId) ?? [];
    lista.push(minutos);
    temposPorBarbeiro.set(ag.barbeiroId, lista);
  }

  const porBarbeiro = barbeiros.map((b) => {
    const fat = faturamentoMap.get(b.id);
    const tempos = temposPorBarbeiro.get(b.id) ?? [];
    return {
      barbeiroId: b.id,
      nome: b.nome,
      faturamentoBruto: fat?.total ?? 0,
      cortesConcluidos: fat?.quantidade ?? 0,
      corteMaisFeito: corteMaisFeitoMap.get(b.id) ?? null,
      cortesCancelados: canceladosMap.get(b.id) ?? 0,
      tempoMedioParaAceitarMinutos: tempos.length > 0 ? tempos.reduce((a, c) => a + c, 0) / tempos.length : null,
      pedidosAceitosNoPeriodo: tempos.length,
    };
  });

  return NextResponse.json({ de: inicio, ate: fim, porBarbeiro });
}
