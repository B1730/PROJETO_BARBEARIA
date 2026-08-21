import Link from "next/link";
import { buscarBarbeariaPublica } from "@/lib/barbearia";
import PaginaBarbeariaCliente from "./PaginaBarbeariaCliente";

// Server Component: busca a barbearia no servidor (slug já é conhecido na
// hora da requisição, rota pública) em vez de mostrar "Carregando..." em
// toda visita — essa é a página mais acessada do site (link público
// compartilhado pelo cliente da barbearia). A parte interativa (escolher
// corte/barbeiro/horário) continua num client component à parte.
export default async function PaginaBarbearia({ params }: { params: { slug: string } }) {
  const barbearia = await buscarBarbeariaPublica(params.slug);

  if (!barbearia) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="font-display text-2xl mb-3">Barbearia não encontrada</h1>
        <p className="text-sm text-ink/60 mb-6">O link que você acessou não corresponde a nenhuma barbearia cadastrada.</p>
        <Link href="/" className="btn-secondary">← Voltar pro início</Link>
      </main>
    );
  }

  // Um valor Decimal do Prisma não atravessa a fronteira Server->Client
  // Component (não é serializável) — converte pra string antes de passar
  // pra baixo, igual NextResponse.json() já fazia automaticamente
  // (Decimal tem um toJSON próprio) quando isso vinha de uma rota de API.
  const barbeariaSerializavel = {
    ...barbearia,
    servicos: barbearia.servicos.map((s) => ({
      ...s,
      precoBase: s.precoBase.toString(),
      barbeiros: s.barbeiros.map((b) => ({ ...b, preco: b.preco.toString() })),
    })),
  };

  return <PaginaBarbeariaCliente barbearia={barbeariaSerializavel} slug={params.slug} />;
}
