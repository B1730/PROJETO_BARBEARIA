import { db } from "./db";

// Usado tanto por GET /api/barearias/[slug] (fluxo antigo, client-side)
// quanto por src/app/[slug]/page.tsx (Server Component — busca no servidor
// pra não mostrar "Carregando..." em toda visita da página pública mais
// acessada do site). Mesma query nos dois lugares, pra nunca divergir.
export async function buscarBarbeariaPublica(slug: string) {
  return db.barbearia.findUnique({
    where: { slug },
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
}

export type BarbeariaPublica = NonNullable<Awaited<ReturnType<typeof buscarBarbeariaPublica>>>;
