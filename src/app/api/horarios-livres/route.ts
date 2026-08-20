import { NextRequest, NextResponse } from "next/server";
import { calcularHorariosLivres } from "@/lib/horarios";
import { db } from "@/lib/db";

// GET /api/horarios-livres?barbeiroId=xxx&servicoId=yyy&data=2026-08-20
// Tela do cliente chama isso depois de escolher barbeiro + corte.
export async function GET(req: NextRequest) {
  const barbeiroId = req.nextUrl.searchParams.get("barbeiroId");
  const servicoId = req.nextUrl.searchParams.get("servicoId");
  const data = req.nextUrl.searchParams.get("data");

  if (!barbeiroId || !servicoId || !data) {
    return NextResponse.json({ erro: "Parâmetros faltando" }, { status: 400 });
  }
  // Sem isso, uma data mal formada (ex.: "abc") virava Invalid Date lá na
  // frente e estourava um 500 cru dentro de calcularHorariosLivres — essa
  // rota é pública, então precisa validar antes de confiar no formato.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ erro: "Data inválida" }, { status: 400 });
  }

  // servico e barbeiro não dependem um do outro — buscar em paralelo em vez
  // de sequencial. É a rota mais chamada do fluxo público de agendamento
  // (uma vez por cada dia que o cliente clica no calendário).
  const [servico, barbeiro] = await Promise.all([
    db.servico.findUnique({ where: { id: servicoId }, select: { ativo: true, duracaoMinutos: true, barbeariaId: true } }),
    db.usuario.findUnique({ where: { id: barbeiroId }, select: { papel: true, barbeariaId: true } }),
  ]);
  if (!servico || !servico.ativo) {
    return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });
  }
  // Mesma checagem cross-tenant que POST /api/agendamentos já faz — sem
  // isso, dava pra consultar a agenda de um barbeiro de uma barbearia
  // usando o servicoId de outra barbearia qualquer (vazamento do padrão de
  // horários ocupados de um concorrente).
  if (!barbeiro || barbeiro.papel !== "BARBEIRO" || barbeiro.barbeariaId !== servico.barbeariaId) {
    return NextResponse.json({ erro: "Barbeiro não encontrado" }, { status: 404 });
  }

  const resultado = await calcularHorariosLivres({
    barbeiroId,
    data,
    duracaoMinutos: servico.duracaoMinutos,
  });

  return NextResponse.json(resultado);
}
