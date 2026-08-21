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
  const [barbeiroEscolhidoId, setBarbeiroEscolhidoId] = useState<string | null>(null);
  // Um agendamento pode ter mais de um corte (ex.: cabelo + barba).
  const [servicosEscolhidos, setServicosEscolhidos] = useState<Servico[]>([]);
  const [data, setData] = useState("");
  const [horarios, setHorarios] = useState<string[]>([]);
  const [ocupados, setOcupados] = useState<string[]>([]);
  const [semExpediente, setSemExpediente] = useState(false);
  const [diaEncerrado, setDiaEncerrado] = useState(false);
  const [horaEscolhida, setHoraEscolhida] = useState<string | null>(null);
  const [meuWhatsapp, setMeuWhatsapp] = useState("");
  // Só pedido de quem não está logado como CLIENTE — nome+WhatsApp bastam
  // pra agendar sem conta (regra de negócio 15); logado, o nome já vem da
  // sessão.
  const [nomeConvidado, setNomeConvidado] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [mensagemEhErro, setMensagemEhErro] = useState(false);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [barbeiroConfirmado, setBarbeiroConfirmado] = useState<{ nome: string; whatsapp: string | null } | null>(null);
  // Link pra ver/cancelar esse pedido depois sem precisar de conta (regra
  // de negócio 15) — mostrado junto da mensagem de sucesso.
  const [linkAcompanhamento, setLinkAcompanhamento] = useState<string | null>(null);

  const ehClienteLogado = sessao?.usuario.papel === "CLIENTE";

  useEffect(() => {
    fetch("/api/auth/sessao")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSessao(d))
      .finally(() => setCarregandoSessao(false));
  }, []);

  // Se o cliente já tinha WhatsApp cadastrado (no cadastro ou em "Meus
  // agendamentos"), pré-preenche pra ele não precisar digitar de novo.
  useEffect(() => {
    if (sessao?.usuario.papel !== "CLIENTE") return;
    fetch("/api/perfil")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.usuario?.whatsapp) setMeuWhatsapp(d.usuario.whatsapp); });
  }, [sessao]);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setSessao(null);
    } finally {
      setSaindo(false);
    }
  }

  // Limpa a mensagem/link de resultado de um pedido anterior sempre que o
  // cliente escolhe outro profissional/corte/data/horário — sem isso, a
  // mensagem "Pedido enviado!" (e o link de WhatsApp) de um agendamento já
  // feito reaparecia na hora ao escolher algo diferente, antes desse novo
  // pedido ser realmente enviado.
  function limparResultadoAnterior() {
    setMensagem("");
    setMensagemEhErro(false);
    setBarbeiroConfirmado(null);
    setLinkAcompanhamento(null);
  }

  function alternarServico(s: Servico) {
    setServicosEscolhidos((atual) =>
      atual.some((x) => x.id === s.id) ? atual.filter((x) => x.id !== s.id) : [...atual, s]
    );
    setHoraEscolhida(null);
    limparResultadoAnterior();
  }

  // Ordem pedida: primeiro escolhe o(s) corte(s) (barbearia toda, sem
  // filtro), depois só aparecem os profissionais que atendem TODOS os
  // cortes escolhidos (interseção, não união) — ex.: cliente escolhe
  // cabelo+barba, só aparece quem faz as duas coisas, não quem faz só uma.
  const barbeirosElegiveis =
    servicosEscolhidos.length > 0
      ? barbearia.usuarios.filter((u) => servicosEscolhidos.every((s) => s.barbeiros.some((b) => b.barbeiroId === u.id)))
      : [];
  const precoTotal = servicosEscolhidos.reduce((soma, s) => soma + Number(s.precoBase), 0);
  const duracaoTotal = servicosEscolhidos.reduce((soma, s) => soma + s.duracaoMinutos, 0);

  // Se a lista de cortes escolhidos mudar de um jeito que o profissional já
  // selecionado não atenda mais TODOS eles, a escolha de profissional some
  // — evita ficar com um barbeiro inválido selecionado sem o cliente notar.
  useEffect(() => {
    if (!barbeiroEscolhidoId) return;
    const aindaElegivel = servicosEscolhidos.every((s) => s.barbeiros.some((b) => b.barbeiroId === barbeiroEscolhidoId));
    if (!aindaElegivel) {
      setBarbeiroEscolhidoId(null);
      setHoraEscolhida(null);
      limparResultadoAnterior();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicosEscolhidos, barbeiroEscolhidoId]);

  useEffect(() => {
    if (servicosEscolhidos.length === 0 || !barbeiroEscolhidoId || !data) return;
    let cancelado = false;
    setCarregandoHorarios(true);
    const servicoIds = servicosEscolhidos.map((s) => s.id).join(",");
    fetch(`/api/horarios-livres?barbeiroId=${barbeiroEscolhidoId}&servicoIds=${servicoIds}&data=${data}`)
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
  }, [servicosEscolhidos, barbeiroEscolhidoId, data]);

  async function confirmarAgendamento() {
    setMensagem("");
    setMensagemEhErro(false);
    setBarbeiroConfirmado(null);
    setLinkAcompanhamento(null);

    const whatsappLimpo = meuWhatsapp.replace(/\D/g, "");
    if (whatsappLimpo.length < 8) {
      setMensagem("Informe um número de WhatsApp válido — o barbeiro pode precisar entrar em contato.");
      setMensagemEhErro(true);
      return;
    }
    if (!ehClienteLogado && nomeConvidado.trim().length < 2) {
      setMensagem("Informe seu nome.");
      setMensagemEhErro(true);
      return;
    }

    setEnviando(true);
    if (ehClienteLogado) {
      // Salva o WhatsApp no perfil antes de agendar, pra ficar valendo pra
      // esse (e os próximos) agendamento — GET /api/agendamentos já devolve
      // isso pro barbeiro junto com o resto dos dados de contato.
      await fetch("/api/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: meuWhatsapp }),
      });
    }

    const resp = await fetch("/api/agendamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barbeiroId: barbeiroEscolhidoId,
        servicoIds: servicosEscolhidos.map((s) => s.id),
        data,
        hora: horaEscolhida,
        // Sem conta, o servidor usa isso pra identificar/criar o cliente
        // (regra de negócio 15) — logado, é ignorado.
        ...(ehClienteLogado ? {} : { nomeCliente: nomeConvidado, whatsapp: meuWhatsapp }),
      }),
    });
    const dados = await resp.json();
    setEnviando(false);
    if (!resp.ok) {
      setMensagemEhErro(true);
      if (resp.status === 403) {
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
    if (dados.tokenAcompanhamento) setLinkAcompanhamento(`/acompanhar/${dados.tokenAcompanhamento}`);
    // Esconde o cartão "Confirmar/Solicitar agendamento" (evita reenvio
    // acidental) — a mensagem de sucesso continua visível por conta própria,
    // sem depender de horaEscolhida (ver seção separada abaixo).
    setHoraEscolhida(null);
  }

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
                <button onClick={sair} disabled={saindo} className="underline disabled:opacity-50 disabled:cursor-not-allowed">
                  {saindo ? "Saindo..." : "Sair"}
                </button>
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
        <h2 className="font-medium mb-3">1. Escolha o(s) corte(s)</h2>
        <p className="text-xs text-ink/50 mb-2">Pode escolher mais de um — por exemplo, cabelo + barba.</p>
        {barbearia.servicos.length === 0 ? (
          <p className="text-sm text-ink/50">Essa barbearia não tem cortes cadastrados.</p>
        ) : (
          <div className="grid gap-2">
            {barbearia.servicos.map((s) => {
              const escolhido = servicosEscolhidos.some((x) => x.id === s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => alternarServico(s)}
                  className={`card text-left flex justify-between items-center gap-3 ${escolhido ? "border-accent" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center text-[10px] ${escolhido ? "bg-accent border-accent text-white" : "border-line"}`}
                      aria-hidden
                    >
                      {escolhido ? "✓" : ""}
                    </span>
                    {s.imagemUrl ? (
                      <Image src={s.imagemUrl} alt={s.nome} width={48} height={48} className="h-12 w-12 rounded-md object-cover shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded-md bg-accentSoft shrink-0" aria-hidden />
                    )}
                    <span>{s.nome} <span className="text-ink/50 text-sm">({s.duracaoMinutos} min)</span></span>
                  </div>
                  <span className="font-medium">R$ {Number(s.precoBase).toFixed(2)}</span>
                </button>
              );
            })}
          </div>
        )}
        {servicosEscolhidos.length > 0 && (
          <p className="text-sm text-ink/70 mt-3">
            Total: <strong>R$ {precoTotal.toFixed(2)}</strong> · {duracaoTotal} min
          </p>
        )}
      </section>

      {servicosEscolhidos.length > 0 && (
        <section className="mb-8">
          <h2 className="font-medium mb-3">2. Escolha o profissional</h2>
          {barbeirosElegiveis.length === 0 ? (
            <p className="text-sm text-ink/50">Nenhum profissional atende todos os cortes escolhidos — tente escolher menos cortes de uma vez.</p>
          ) : (
            <div className="grid gap-2">
              {barbeirosElegiveis.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    if (barbeiroEscolhidoId === b.id) return;
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
          )}
        </section>
      )}

      {barbeiroEscolhidoId && servicosEscolhidos.length > 0 && (
        <section className="mb-8">
          <h2 className="font-medium mb-3">3. Escolha o dia e horário</h2>
          <input
            type="date"
            className="input mb-4"
            value={data}
            onChange={(e) => { setData(e.target.value); setHoraEscolhida(null); limparResultadoAnterior(); }}
          />
          {data && (
            <>
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
                          className="px-3 py-2 rounded-md border border-line bg-line/60 text-ink/60 cursor-not-allowed"
                        >
                          {hora}
                        </button>
                      )
                    )}
              </div>
              {!carregandoHorarios && ocupados.length > 0 && (
                <p className="text-xs text-ink/50 mt-2">Os horários em cinza já estão ocupados.</p>
              )}
            </>
          )}
        </section>
      )}

      {horaEscolhida && (
        <section className="card mb-4">
          <form onSubmit={(e) => { e.preventDefault(); confirmarAgendamento(); }}>
            <p className="mb-3">
              Confirmar <strong>{servicosEscolhidos.map((s) => s.nome).join(" + ")}</strong> (R$ {precoTotal.toFixed(2)})
              em <strong>{data}</strong> às <strong>{horaEscolhida}</strong>?
            </p>
            {!ehClienteLogado && (
              <>
                <label className="block text-sm text-ink/70 mb-1" htmlFor="nomeConvidado">
                  Seu nome
                </label>
                <input
                  id="nomeConvidado"
                  className="input mb-3"
                  placeholder="Seu nome completo"
                  value={nomeConvidado}
                  onChange={(e) => { setNomeConvidado(e.target.value); limparResultadoAnterior(); }}
                  required
                />
              </>
            )}
            <label className="block text-sm text-ink/70 mb-1" htmlFor="meuWhatsapp">
              Seu WhatsApp (com DDD e país) — pra o barbeiro entrar em contato se precisar
            </label>
            <input
              id="meuWhatsapp"
              className="input mb-3"
              placeholder="5511999999999"
              value={meuWhatsapp}
              onChange={(e) => { setMeuWhatsapp(e.target.value); limparResultadoAnterior(); }}
              required
            />
            {!ehClienteLogado && (
              <p className="text-xs text-ink/50 mb-3">
                Não precisa criar conta pra agendar — só nome e WhatsApp. Se preferir acompanhar tudo depois em "Meus
                agendamentos", dá pra{" "}
                <a className="underline" href={`/entrar?next=/${slug}`}>entrar</a> ou{" "}
                <a className="underline" href={`/cadastro?papel=CLIENTE&next=/${slug}`}>criar conta</a> antes.
              </p>
            )}
            <button type="submit" className="btn-primary" disabled={enviando}>
              {enviando ? "Enviando..." : "Solicitar agendamento"}
            </button>
          </form>
        </section>
      )}

      {mensagem && (
        <section className="card">
          <p className={`text-sm ${mensagemEhErro ? "text-red-600" : "text-green-700"}`}>
            {mensagem}{" "}
            {mensagemEhErro && mensagem.includes("conta") && (
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
          {linkAcompanhamento && (
            <p className="text-sm text-ink/70 mt-3">
              Guarde esse link pra ver o status ou cancelar depois, sem precisar de conta:{" "}
              <a className="underline break-all" href={linkAcompanhamento}>
                {typeof window !== "undefined" ? `${window.location.origin}${linkAcompanhamento}` : linkAcompanhamento}
              </a>
            </p>
          )}
        </section>
      )}
    </main>
  );
}
