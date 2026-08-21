import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exigirAcessoAdmin } from "@/lib/exigirSessao";

// GET /api/admin/barbeiros?barbeariaId=...
// Somente leitura — mesmo formato que GET /api/barbeiros devolve pro dono
// (regra de negócio 14).
export async function GET(req: NextRequest) {
  const acesso = await exigirAcessoAdmin(req);
  if (acesso instanceof NextResponse) return acesso;
  const { barbeariaId } = acesso;

  const barbeiros = await db.usuario.findMany({
    where: { barbeariaId, papel: "BARBEIRO" },
    select: { id: true, nome: true, email: true, criadoEm: true, ehChefe: true },
  });

  return NextResponse.json({ barbeiros });
}
