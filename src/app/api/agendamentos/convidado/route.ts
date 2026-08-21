import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lerTokenAgendamentoConvidado } from "@/lib/auth";

// GET /api/agendamentos/convidado?token=...
// Único jeito de um CLIENTE convidado (sem conta, regra de negócio 15) ver
// o próprio pedido depois — a "sessão" aqui é o token assinado em si (prova
// posse SÓ desse agendamento), não um cookie de login. Rota pública de
// propósito; sem token válido, não devolve nada.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ erro: "Link inválido" }, { status: 400 });

  const identidade = await lerTokenAgendamentoConvidado(token);
  if (!identidade) return NextResponse.json({ erro: "Link inválido ou expirado" }, { status: 400 });

  const agendamento = await db.agendamento.findUnique({
    where: { id: identidade.agendamentoId },
    select: {
      id: true,
      status: true,
      data: true,
      precoCobrado: true,
      cancelamentoSolicitadoEm: true,
      motivoCancelamento: true,
      barbeiro: { select: { nome: true } },
      servicos: { select: { nomeServico: true } },
    },
  });
  if (!agendamento) return NextResponse.json({ erro: "Agendamento não encontrado" }, { status: 404 });

  return NextResponse.json({ agendamento });
}
