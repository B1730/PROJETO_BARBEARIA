import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/barbearias/minha-barbearia
// Retorna a barbearia com seus serviços e barbeiros ativos — usado pela
// tela do cliente para montar o fluxo "escolha o corte -> escolha o barbeiro".
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const barbearia = await db.barbearia.findUnique({
    where: { slug: params.slug },
    include: {
      servicos: {
        where: { ativo: true },
        include: {
          barbeiros: {
            select: { barbeiroId: true, preco: true, barbeiro: { select: { id: true, nome: true } } },
          },
        },
      },
      usuarios: {
        where: { papel: "BARBEIRO" },
        select: { id: true, nome: true },
      },
    },
  });

  if (!barbearia) {
    return NextResponse.json({ erro: "Barbearia não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ barbearia });
}
