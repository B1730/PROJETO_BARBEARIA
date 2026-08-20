import { NextRequest, NextResponse } from "next/server";
import { buscarBarbeariaPublica } from "@/lib/barbearia";

// GET /api/barbearias/minha-barbearia
// Retorna a barbearia com seus serviços e barbeiros ativos — usado pela
// tela do cliente para montar o fluxo "escolha o corte -> escolha o barbeiro".
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const barbearia = await buscarBarbeariaPublica(params.slug);

  if (!barbearia) {
    return NextResponse.json({ erro: "Barbearia não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ barbearia });
}
