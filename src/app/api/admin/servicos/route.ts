import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exigirAcessoAdmin } from "@/lib/exigirSessao";

// GET /api/admin/servicos?barbeariaId=...
// Somente leitura — mesmo formato que GET /api/servicos devolve pro dono
// (regra de negócio 14).
export async function GET(req: NextRequest) {
  const acesso = await exigirAcessoAdmin(req);
  if (acesso instanceof NextResponse) return acesso;
  const { barbeariaId } = acesso;

  const servicos = await db.servico.findMany({
    where: { barbeariaId },
    include: {
      barbeiros: { select: { barbeiroId: true, preco: true, barbeiro: { select: { id: true, nome: true } } } },
    },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json({ servicos });
}
