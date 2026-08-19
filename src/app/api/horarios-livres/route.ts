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

  const servico = await db.servico.findUnique({ where: { id: servicoId } });
  if (!servico || !servico.ativo) {
    return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });
  }

  // Mesma checagem cross-tenant que POST /api/agendamentos já faz — sem
  // isso, dava pra consultar a agenda de um barbeiro de uma barbearia
  // usando o servicoId de outra barbearia qualquer (vazamento do padrão de
  // horários ocupados de um concorrente).
  const barbeiro = await db.usuario.findUnique({ where: { id: barbeiroId } });
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
