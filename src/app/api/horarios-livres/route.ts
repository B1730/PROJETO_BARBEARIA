import { NextRequest, NextResponse } from "next/server";
import { calcularHorariosLivres } from "@/lib/horarios";
import { db } from "@/lib/db";

// GET /api/horarios-livres?barbeiroId=xxx&servicoIds=id1,id2&data=2026-08-20
// Tela do cliente chama isso depois de escolher barbeiro + corte(s) — pode
// ser mais de um corte no mesmo agendamento (ex.: cabelo + barba), por isso
// servicoIds é uma lista separada por vírgula, não um único id.
export async function GET(req: NextRequest) {
  const barbeiroId = req.nextUrl.searchParams.get("barbeiroId");
  const servicoIdsParam = req.nextUrl.searchParams.get("servicoIds");
  const data = req.nextUrl.searchParams.get("data");

  if (!barbeiroId || !servicoIdsParam || !data) {
    return NextResponse.json({ erro: "Parâmetros faltando" }, { status: 400 });
  }
  const servicoIds = servicoIdsParam.split(",").filter(Boolean);
  if (servicoIds.length === 0) {
    return NextResponse.json({ erro: "Parâmetros faltando" }, { status: 400 });
  }
  // Sem isso, uma data mal formada (ex.: "abc") virava Invalid Date lá na
  // frente e estourava um 500 cru dentro de calcularHorariosLivres — essa
  // rota é pública, então precisa validar antes de confiar no formato.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ erro: "Data inválida" }, { status: 400 });
  }

  // servicos e barbeiro não dependem um do outro — buscar em paralelo em vez
  // de sequencial. É a rota mais chamada do fluxo público de agendamento
  // (uma vez por cada dia que o cliente clica no calendário).
  const [servicos, barbeiro] = await Promise.all([
    db.servico.findMany({ where: { id: { in: servicoIds } }, select: { id: true, ativo: true, duracaoMinutos: true, barbeariaId: true } }),
    db.usuario.findUnique({ where: { id: barbeiroId }, select: { papel: true, barbeariaId: true, atendeComoBarbeiro: true } }),
  ]);
  if (servicos.length !== servicoIds.length || servicos.some((s) => !s.ativo)) {
    return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });
  }
  const barbeariaId = servicos[0].barbeariaId;
  if (servicos.some((s) => s.barbeariaId !== barbeariaId)) {
    return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });
  }
  // Mesma checagem cross-tenant que POST /api/agendamentos já faz — sem
  // isso, dava pra consultar a agenda de um barbeiro de uma barbearia
  // usando o servicoId de outra barbearia qualquer (vazamento do padrão de
  // horários ocupados de um concorrente). "barbeiro" pode ser um BARBEIRO
  // de verdade, ou o DONO que ativou "também corto cabelo" (regra 10).
  const ehBarbeiroValido = barbeiro?.papel === "BARBEIRO" || (barbeiro?.papel === "DONO" && barbeiro.atendeComoBarbeiro);
  if (!barbeiro || !ehBarbeiroValido || barbeiro.barbeariaId !== barbeariaId) {
    return NextResponse.json({ erro: "Barbeiro não encontrado" }, { status: 404 });
  }

  const duracaoMinutos = servicos.reduce((soma, s) => soma + s.duracaoMinutos, 0);

  const resultado = await calcularHorariosLivres({ barbeiroId, data, duracaoMinutos });

  return NextResponse.json(resultado);
}
