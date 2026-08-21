import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exigirAcessoAdmin } from "@/lib/exigirSessao";

// GET /api/admin/agendamentos?barbeariaId=...
// Somente leitura — mesmo formato que GET /api/agendamentos devolve pro
// DONO, mas exige um acesso concedido em vez de sessão de dono (regra de
// negócio 14). Nenhum POST/PATCH/DELETE existe nesse arquivo de propósito.
export async function GET(req: NextRequest) {
  const acesso = await exigirAcessoAdmin(req);
  if (acesso instanceof NextResponse) return acesso;
  const { barbeariaId } = acesso;

  const agendamentos = await db.agendamento.findMany({
    where: { barbeariaId },
    include: {
      cliente: { select: { id: true, nome: true, email: true, whatsapp: true } },
      barbeiro: { select: { id: true, nome: true } },
      servicos: { select: { nomeServico: true, precoServico: true, duracaoMinutos: true } },
    },
    orderBy: { data: "desc" },
    take: 200,
  });

  return NextResponse.json({ agendamentos });
}
