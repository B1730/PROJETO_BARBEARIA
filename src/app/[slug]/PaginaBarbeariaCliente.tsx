"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// precoBase/preco chegam como string, não Decimal — o Server Component
// (page.tsx) converte antes de passar pra cá, porque um valor Decimal do
// Prisma não atravessa a fronteira Server->Client Component.
type Servico = {
  id: string; nome: string; precoBase: string; duracaoMinutos: number; imagemUrl: string | null;
  barbeiros: { barbeiroId: string; preco: string; barbeiro: { id: string; nome: string } }[];
};
type Barbearia = { nome: string; servicos: Servico[]; usuarios: { id: string; nome: string; fotoUrl: string | null }[] };
type Sessao = { usuario: { id: string; nome: string; papel: "CLIENTE" | "BARBEIRO" | "DONO" } };

export default function PaginaBarbeariaCliente({ barbearia, slug }: { barbearia: Barbearia; slug: string }) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const [servicoEscolhido, setServicoEscolhido] = useState<Servico | null>(null);
  const [barbeiroEscolhidoId, setBarbeiroEscolhidoId] = useState<string | null>(null);
  const [data, setData] = useState("");
  const [horarios, setHorarios] = useState<string[]>([]);
  const [ocupados, setOcupados] = useState<string[]>([]);
  const [semExpediente, setSemExpediente] = useState(false);
  const [diaEncerrado, setDiaEncerrado] = useState(false);
  const [horaEscolhida, setHoraEscolhida] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [barbeiroConfirmado, setBarbeiroConfirmado] = useState<{ nome: string; whatsapp: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/auth/sessao")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSessao(d))
      .finally(() => setCarregandoSessao(false));
  }, []);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    setSessao(null);
  }

  // Limpa a mensagem/link de resultado de um pedido anterior sempre que o
  // cliente escolhe outro corte/barbeiro/data/horário — sem isso, a
  // mensagem "Pedido enviado!" (e o link de WhatsApp) de um agendamento já
  // feito reaparecia na hora ao escolher um horário diferente, antes desse
  // novo pedido ser realmente enviado.
  function limparResultadoAnterior() {
    setMensagem("");
    setBarbeiroConfirmado(null);
  }

  useEffect(() => {
    if (!servicoEscolhido || !barbeiroEscolhidoId || !data) return;
    let cancelado = false;
    setCarregandoHorarios(true);
    fetch(`/api/horarios-livres?barbeiroId=${barbeiroEscolhidoId}&servicoId=${servicoEscolhido.id}&data=${data}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelado) {
          setHorarios(d.horarios || []);
          setOcupados(d.ocupados || []);
          setSemExpediente(!!d.semExpediente);
          setDiaEncerrado(!!d.diaEncerrado);
          setCarregandoHorarios(false);
        }
      });
    return () => { cancelado = true; };
  }, [servicoEscolhido, barbeiroEscolhidoId, data]);

  async function confirmarAgendamento() {
    setMensagem("");
    setBarbeiroConfirmado(null);
    setEnviando(true);
    const resp = await fetch("/api/agendamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      } else if (resp.status === 403) {
        setMensagem(
          "Essa conta é de dono ou barbeiro, não de cliente. Saia e entre (ou crie uma conta) com um e-mail de cliente pra agendar."
        );
      } else {
        setMensagem(dados.erro || "Não foi possível agendar");
      }
      return;
    }
    setMensagem("Pedido enviado! O barbeiro vai confirmar em breve.");
    if (dados.barbeiro) setBarbeiroConfirmado(dados.barbeiro);
    // Esconde o cartão "Confirmar/Solicitar agendamento" (evita reenvio
    // acidental) — a mensagem de sucesso continua visível por conta própria,
    // sem depender de horaEscolhida (ver seção separada abaixo).
    setHoraEscolhida(null);
  }

  // Barbeiros que efetivamente fazem o serviço escolhido
  const barbeirosDoServico = servicoEscolhido
    ? barbearia.usuarios.filter((u) =>
        servicoEscolhido.barbeiros.length === 0 ? true : servicoEscolhido.barbeiros.some((b) => b.barbeiroId === u.id)
      )
    : [];

  return (
    <main className="max-w-2xl mx-auto px-6 py-14">
      {!carregandoSessao && (
        <div className="flex justify-between items-center gap-3 mb-4">
          <span className="text-sm text-ink/60">
            {sessao?.usuario ? (
              <>
                {sessao.usuario.papel === "CLIENTE"
                  ? `Olá, ${sessao.usuario.nome}`
                  : `Logado como ${sessao.usuario.papel === "DONO" ? "dono" : "barbeiro"} (${sessao.usuario.nome})`}
                {" · "}
                <button onClick={sair} className="underline">Sair</button>
              </>
            ) : (
              <>
                <a className="underline" href={`/entrar?next=/${slug}`}>Entrar</a>{" "}ou{" "}
                <a className="underline" href={`/cadastro?papel=CLIENTE&next=/${slug}`}>Cadastre-se</a>
              </>
            )}
          </span>
          {sessao?.usuario?.papel === "CLIENTE" && (
            <a href="/meus-agendamentos" className="btn-secondary text-sm shrink-0">
              Meus agendamentos
            </a>
          )}
        </div>
      )}
      <h1 className="font-display text-3xl mb-8">{barbearia.nome}</h1>

      <section className="mb-8">
        <h2 className="font-medium mb-3">1. Escolha o corte</h2>
        <div className="grid gap-2">
          {barbearia.servicos.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setServicoEscolhido(s);
                setBarbeiroEscolhidoId(null);
                setHoraEscolhida(null);
                limparResultadoAnterior();
              }}
              className={`card text-left flex justify-between items-center gap-3 ${servicoEscolhido?.id === s.id ? "border-accent" : ""}`}
            >
              <div className="flex items-center gap-3">
                {s.imagemUrl ? (
                  <Image src={s.imagemUrl} alt={s.nome} width={48} height={48} className="h-12 w-12 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-accentSoft shrink-0" aria-hidden />
                )}
                <span>{s.nome} <span className="text-ink/50 text-sm">({s.duracaoMinutos} min)</span></span>
              </div>
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
                onClick={() => {
                  setBarbeiroEscolhidoId(b.id);
                  setHoraEscolhida(null);
                  limparResultadoAnterior();
                }}
                className={`card text-left flex items-center gap-3 ${barbeiroEscolhidoId === b.id ? "border-accent" : ""}`}
              >
                {b.fotoUrl ? (
                  <Image src={b.fotoUrl} alt={b.nome} width={40} height={40} className="h-10 w-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-accentSoft shrink-0" aria-hidden />
                )}
                {b.nome}
              </button>
            ))}
          </div>
        </section>
      )}

      {barbeiroEscolhidoId && (
        <section className="mb-8">
          <h2 className="font-medium mb-3">3. Escolha o dia e horário</h2>
          <input
            type="date"
            className="input mb-4"
            value={data}
            onChange={(e) => { setData(e.target.value); setHoraEscolhida(null); limparResultadoAnterior(); }}
          />
          {data && (
            <div className="flex flex-wrap gap-2">
              {carregandoHorarios && <p className="text-sm text-ink/50">Carregando horários...</p>}
              {!carregandoHorarios && horarios.length === 0 && ocupados.length === 0 && (
                <p className="text-sm text-ink/50">
                  {semExpediente
                    ? "Esse profissional não atende nesse dia da semana. Escolha outra data."
                    : diaEncerrado
                    ? "O expediente desse dia já encerrou. Escolha outra data."
                    : "Nenhum horário livre neste dia — todos os horários já foram preenchidos."}
                </p>
              )}
              {!carregandoHorarios &&
                [...horarios.map((h) => ({ hora: h, livre: true })), ...ocupados.map((h) => ({ hora: h, livre: false }))]
                  .sort((a, b) => a.hora.localeCompare(b.hora))
                  .map(({ hora, livre }) =>
                    livre ? (
                      <button
                        key={hora}
                        onClick={() => { setHoraEscolhida(hora); limparResultadoAnterior(); }}
                        className={`px-3 py-2 rounded-md border ${horaEscolhida === hora ? "bg-accent text-white border-accent" : "border-line"}`}
                      >
                        {hora}
                      </button>
                    ) : (
                      <button
                        key={hora}
                        disabled
                        title="Já tem agendamento nesse horário"
                        className="px-3 py-2 rounded-md border border-line bg-line/40 text-ink/30 cursor-not-allowed"
                      >
                        {hora}
                      </button>
                    )
                  )}
            </div>
          )}
        </section>
      )}

      {horaEscolhida && (
        <section className="card mb-4">
          <p className="mb-3">
            Confirmar <strong>{servicoEscolhido?.nome}</strong> em <strong>{data}</strong> às <strong>{horaEscolhida}</strong>?
          </p>
          <button className="btn-primary" disabled={enviando} onClick={confirmarAgendamento}>
            {enviando ? "Enviando..." : "Solicitar agendamento"}
          </button>
        </section>
      )}

      {mensagem && (
        <section className="card">
          <p className="text-sm">
            {mensagem}{" "}
            {mensagem.includes("conta") && (
              <>
                <a className="underline" href={`/entrar?next=/${slug}`}>Entrar</a> ou{" "}
                <a className="underline" href={`/cadastro?papel=CLIENTE&next=/${slug}`}>criar conta</a>
              </>
            )}
          </p>
          {barbeiroConfirmado?.whatsapp && (
            <a
              className="btn-secondary inline-block mt-3"
              href={`https://wa.me/${barbeiroConfirmado.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Falar no WhatsApp com {barbeiroConfirmado.nome}
            </a>
          )}
        </section>
      )}
    </main>
  );
}
