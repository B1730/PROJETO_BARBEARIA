"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Servico = { id: string; nome: string; precoBase: string; duracaoMinutos: number; barbeiros: { barbeiroId: string; preco: string; barbeiro: { id: string; nome: string } }[] };
type Barbearia = { id: string; nome: string; servicos: Servico[]; usuarios: { id: string; nome: string }[] };

export default function PaginaBarbearia() {
  const { slug } = useParams<{ slug: string }>();
  const [barbearia, setBarbearia] = useState<Barbearia | null>(null);
  const [servicoEscolhido, setServicoEscolhido] = useState<Servico | null>(null);
  const [barbeiroEscolhidoId, setBarbeiroEscolhidoId] = useState<string | null>(null);
  const [data, setData] = useState("");
  const [horarios, setHorarios] = useState<string[]>([]);
  const [horaEscolhida, setHoraEscolhida] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [naoEncontrada, setNaoEncontrada] = useState(false);

  useEffect(() => {
    fetch(`/api/barbearias/${slug}`)
      .then(async (r) => {
        if (!r.ok) { setNaoEncontrada(true); return; }
        const d = await r.json();
        setBarbearia(d.barbearia);
      });
  }, [slug]);

  useEffect(() => {
    if (!servicoEscolhido || !barbeiroEscolhidoId || !data) return;
    let cancelado = false;
    setCarregandoHorarios(true);
    fetch(`/api/horarios-livres?barbeiroId=${barbeiroEscolhidoId}&servicoId=${servicoEscolhido.id}&data=${data}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelado) { setHorarios(d.horarios || []); setCarregandoHorarios(false); } });
    return () => { cancelado = true; };
  }, [servicoEscolhido, barbeiroEscolhidoId, data]);

  async function confirmarAgendamento() {
    setMensagem("");
    setEnviando(true);
    const resp = await fetch("/api/agendamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barbeariaId: barbearia!.id,
        barbeiroId: barbeiroEscolhidoId,
        servicoId: servicoEscolhido!.id,
        data,
        hora: horaEscolhida,
      }),
    });
    const dados = await resp.json();
    setEnviando(false);
    if (!resp.ok) {
      if (resp.status === 401) {
        setMensagem("Você precisa criar uma conta ou entrar antes de agendar.");
      } else {
        setMensagem(dados.erro || "Não foi possível agendar");
      }
      return;
    }
    setMensagem("Pedido enviado! O barbeiro vai confirmar em breve.");
  }

  if (naoEncontrada) return <main className="max-w-2xl mx-auto px-6 py-20">Barbearia não encontrada.</main>;
  if (!barbearia) return <main className="max-w-2xl mx-auto px-6 py-20 text-ink/60">Carregando...</main>;

  // Barbeiros que efetivamente fazem o serviço escolhido
  const barbeirosDoServico = servicoEscolhido
    ? barbearia.usuarios.filter((u) =>
        servicoEscolhido.barbeiros.length === 0 ? true : servicoEscolhido.barbeiros.some((b) => b.barbeiroId === u.id)
      )
    : [];

  return (
    <main className="max-w-2xl mx-auto px-6 py-14">
      <h1 className="font-display text-3xl mb-8">{barbearia.nome}</h1>

      <section className="mb-8">
        <h2 className="font-medium mb-3">1. Escolha o corte</h2>
        <div className="grid gap-2">
          {barbearia.servicos.map((s) => (
            <button
              key={s.id}
              onClick={() => { setServicoEscolhido(s); setBarbeiroEscolhidoId(null); setHoraEscolhida(null); }}
              className={`card text-left flex justify-between items-center ${servicoEscolhido?.id === s.id ? "border-accent" : ""}`}
            >
              <span>{s.nome} <span className="text-ink/50 text-sm">({s.duracaoMinutos} min)</span></span>
              <span className="font-medium">R$ {Number(s.precoBase).toFixed(2)}</span>
            </button>
          ))}
        </div>
      </section>

      {servicoEscolhido && (
        <section className="mb-8">
          <h2 className="font-medium mb-3">2. Escolha o profissional</h2>
          <div className="grid gap-2">
            {barbeirosDoServico.map((b) => (
              <button
                key={b.id}
                onClick={() => { setBarbeiroEscolhidoId(b.id); setHoraEscolhida(null); }}
                className={`card text-left ${barbeiroEscolhidoId === b.id ? "border-accent" : ""}`}
              >
                {b.nome}
              </button>
            ))}
          </div>
        </section>
      )}

      {barbeiroEscolhidoId && (
        <section className="mb-8">
          <h2 className="font-medium mb-3">3. Escolha o dia e horário</h2>
          <input type="date" className="input mb-4" value={data} onChange={(e) => { setData(e.target.value); setHoraEscolhida(null); }} />
          {data && (
            <div className="flex flex-wrap gap-2">
              {carregandoHorarios && <p className="text-sm text-ink/50">Carregando horários...</p>}
              {!carregandoHorarios && horarios.length === 0 && <p className="text-sm text-ink/50">Nenhum horário livre neste dia.</p>}
              {!carregandoHorarios && horarios.map((h) => (
                <button
                  key={h}
                  onClick={() => setHoraEscolhida(h)}
                  className={`px-3 py-2 rounded-md border ${horaEscolhida === h ? "bg-accent text-white border-accent" : "border-line"}`}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {horaEscolhida && (
        <section className="card">
          <p className="mb-3">
            Confirmar <strong>{servicoEscolhido?.nome}</strong> em <strong>{data}</strong> às <strong>{horaEscolhida}</strong>?
          </p>
          <button className="btn-primary" disabled={enviando} onClick={confirmarAgendamento}>
            {enviando ? "Enviando..." : "Solicitar agendamento"}
          </button>
          {mensagem && (
            <p className="text-sm mt-3">
              {mensagem}{" "}
              {mensagem.includes("conta") && (
                <>
                  <a className="underline" href="/entrar">Entrar</a> ou{" "}
                  <a className="underline" href="/cadastro?papel=CLIENTE">criar conta</a>
                </>
              )}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
