import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="font-display text-4xl mb-4">Agendamento online para barbearias</h1>
      <p className="text-ink/70 mb-8">
        Sua barbearia com página própria, agenda por barbeiro e confirmação de horário
        em poucos cliques — sem planilha, sem grupo de WhatsApp lotado.
      </p>

      <div className="flex flex-wrap gap-3 mb-14">
        <Link href="/cadastro" className="btn-primary">Cadastrar minha barbearia</Link>
        <Link href="/entrar" className="btn-secondary">Entrar</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <h2 className="font-medium mb-2">Cliente</h2>
          <p className="text-sm text-ink/60">
            Escolhe o corte, o barbeiro e o horário livre, e pede o agendamento pela
            página da barbearia.
          </p>
        </div>
        <div className="card">
          <h2 className="font-medium mb-2">Barbeiro</h2>
          <p className="text-sm text-ink/60">
            Define a própria disponibilidade na semana e decide aceitar ou recusar
            cada pedido.
          </p>
        </div>
        <div className="card">
          <h2 className="font-medium mb-2">Dono</h2>
          <p className="text-sm text-ink/60">
            Cadastra barbeiros, cortes e preços, e acompanha o faturamento por dia,
            mês ou ano.
          </p>
        </div>
      </div>

      <p className="text-sm text-ink/50 mt-14">
        Já é cliente de uma barbearia cadastrada? Peça o link direto da página dela.
      </p>
    </main>
  );
}
