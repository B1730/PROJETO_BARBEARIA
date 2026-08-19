import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/barbearias/minha-barbearia
// Retorna a barbearia com seus serviços e barbeiros ativos — usado pela
// tela do cliente para montar o fluxo "escolha o corte -> escolha o barbeiro".
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const barbearia = await db.barbearia.findUnique({
    where: { slug: params.slug },
    // select explícito no nível raiz — sem isso, o id real da barbearia
    // (e telefone/endereco) vazava pra qualquer visitante dessa rota
    // pública. O id não é usado por nada no fluxo do cliente (o servidor
    // sempre deriva a barbearia a partir do servicoId em
    // POST /api/agendamentos, nunca aceita um barbeariaId vindo do body).
    select: {
      nome: true,
      slug: true,
      servicos: {
        where: { ativo: true },
        select: {
          id: true,
          nome: true,
          precoBase: true,
          duracaoMinutos: true,
          imagemUrl: true,
          barbeiros: {
            select: { barbeiroId: true, preco: true, barbeiro: { select: { id: true, nome: true } } },
          },
        },
      },
      usuarios: {
        where: { papel: "BARBEIRO" },
        select: { id: true, nome: true, fotoUrl: true },
      },
    },
  });

  if (!barbearia) {
    return NextResponse.json({ erro: "Barbearia não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ barbearia });
}
