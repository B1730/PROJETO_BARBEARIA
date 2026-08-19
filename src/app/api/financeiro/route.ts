import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao, sessaoTemPrivilegioDeChefe } from "@/lib/exigirSessao";

// GET /api/financeiro?periodo=mes
// periodo: "dia" | "mes" | "ano" (padrão: mes)
// DONO vê o faturamento da barbearia inteira, agrupado por barbeiro.
// BARBEIRO vê só o próprio faturamento — a não ser que seja o barbeiro
// chefe da barbearia E passe ?equipe=1, aí vê o mesmo agrupado que o dono
// vê. Sem esse parâmetro o chefe também só vê o próprio (usado pro
// cartão pessoal dele no painel).
export async function GET(req: NextRequest) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const periodo = req.nextUrl.searchParams.get("periodo") || "mes";
  const agora = new Date();

  // "Hoje" precisa ser calculado no fuso de Brasília, não no fuso do processo
  // Node (em produção, Vercel roda em UTC) — senão o corte de "mês"/"ano"
  // pode ficar até 3h errado perto da virada do dia.
  const hojeBrasil = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  const [anoBrasil, mesBrasil, diaBrasil] = hojeBrasil.split("-").map(Number);

  let inicio: Date;
  let fim: Date;

  if (periodo === "dia") {
    inicio = new Date(Date.UTC(anoBrasil, mesBrasil - 1, diaBrasil, 3, 0, 0));
    fim = new Date(Date.UTC(anoBrasil, mesBrasil - 1, diaBrasil + 1, 3, 0, 0));
  } else if (periodo === "ano") {
    inicio = new Date(Date.UTC(anoBrasil, 0, 1, 3, 0, 0));
    fim = new Date(Date.UTC(anoBrasil + 1, 0, 1, 3, 0, 0));
  } else {
    inicio = new Date(Date.UTC(anoBrasil, mesBrasil - 1, 1, 3, 0, 0));
    fim = new Date(Date.UTC(anoBrasil, mesBrasil, 1, 3, 0, 0));
  }

  const where: any = {
    status: "CONCLUIDO", // só conta o que efetivamente foi realizado
    data: { gte: inicio, lt: fim },
  };
  const equipe = req.nextUrl.searchParams.get("equipe") === "1";

  if (sessao.papel === "DONO") where.barbeariaId = sessao.barbeariaId;
  if (sessao.papel === "BARBEIRO") {
    where.barbeiroId = sessao.usuarioId;
    if (equipe && (await sessaoTemPrivilegioDeChefe(sessao))) {
      delete where.barbeiroId;
      where.barbeariaId = sessao.barbeariaId;
    }
  }

  const agendamentos = await db.agendamento.findMany({
    where,
    include: { barbeiro: { select: { id: true, nome: true } } },
  });

  const totalGeral = agendamentos.reduce((soma, ag) => soma + Number(ag.precoCobrado), 0);

  // Agrupa por barbeiro (útil principalmente pro dono ver quem ganhou quanto)
  const porBarbeiro = new Map<string, { nome: string; total: number; quantidade: number }>();
  for (const ag of agendamentos) {
    const atual = porBarbeiro.get(ag.barbeiroId) || { nome: ag.barbeiro.nome, total: 0, quantidade: 0 };
    atual.total += Number(ag.precoCobrado);
    atual.quantidade += 1;
    porBarbeiro.set(ag.barbeiroId, atual);
  }

  return NextResponse.json({
    periodo,
    desde: inicio,
    totalGeral,
    totalDeAtendimentos: agendamentos.length,
    porBarbeiro: Array.from(porBarbeiro.entries()).map(([id, v]) => ({ barbeiroId: id, ...v })),
  });
}
