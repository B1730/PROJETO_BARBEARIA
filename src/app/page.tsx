import Link from "next/link";
import { redirect } from "next/navigation";
import { pegarSessao } from "@/lib/auth";

export default async function Home() {
  // Quem já tem barbearia (dono/barbeiro) não precisa ver a landing de novo
  // ao voltar pro site — vai direto pro próprio painel.
  const sessao = await pegarSessao();
  if (sessao?.papel === "DONO") redirect("/admin");
  if (sessao?.papel === "BARBEIRO") redirect("/barbeiro");

  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-10%] h-[32rem] w-[32rem] rounded-full bg-accentSoft blur-3xl opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 left-[-15%] h-96 w-96 rounded-full bg-accent/10 blur-3xl"
      />

      <nav className="relative max-w-5xl mx-auto px-6 py-6 flex justify-between items-center">
        <span className="font-display text-lg">Barbearia Online</span>
        {sessao?.papel === "CLIENTE" ? (
          <Link href="/meus-agendamentos" className="text-sm text-ink/70 hover:text-ink transition-colors">
            Meus agendamentos
          </Link>
        ) : (
          <Link href="/entrar" className="text-sm text-ink/70 hover:text-ink transition-colors">
            Entrar
          </Link>
        )}
      </nav>

      <div className="relative max-w-3xl mx-auto px-6 pt-14 pb-24">
        <p className="inline-block text-xs tracking-wide uppercase text-accent bg-accentSoft rounded-full px-3 py-1 mb-6">
          Agendamento online
        </p>
        <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-5">
          Sua barbearia com agenda própria,{" "}
          <span className="text-accent">sem grupo de WhatsApp lotado</span>.
        </h1>
        <p className="text-ink/70 text-lg mb-9 max-w-xl">
          Página própria pra cada barbearia, agenda por barbeiro e confirmação de horário em
          poucos cliques — o cliente escolhe, o barbeiro decide.
        </p>

        <div className="flex flex-wrap gap-3 mb-20">
          <Link
            href="/cadastro"
            className="btn-primary transition-transform hover:scale-[1.03] active:scale-100"
          >
            Cadastrar minha barbearia
          </Link>
          <Link
            href="/entrar"
            className="btn-secondary transition-transform hover:scale-[1.03] active:scale-100"
          >
            Já tenho conta
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              n: "1",
              titulo: "Cliente",
              texto: "Escolhe o corte, o barbeiro e o horário livre, e pede o agendamento pela página da barbearia.",
            },
            {
              n: "2",
              titulo: "Barbeiro",
              texto: "Define a própria disponibilidade na semana e decide aceitar ou recusar cada pedido.",
            },
            {
              n: "3",
              titulo: "Dono",
              texto: "Cadastra barbeiros, cortes e preços, e acompanha o faturamento por dia, mês ou ano.",
            },
          ].map((item) => (
            <div
              key={item.n}
              className="card transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-accent text-white text-sm font-medium mb-3">
                {item.n}
              </span>
              <h2 className="font-medium mb-1.5">{item.titulo}</h2>
              <p className="text-sm text-ink/60">{item.texto}</p>
            </div>
          ))}
        </div>

        <p className="text-sm text-ink/50 mt-14">
          Já é cliente de uma barbearia cadastrada? Peça o link direto da página dela.
        </p>
      </div>
    </main>
  );
}
