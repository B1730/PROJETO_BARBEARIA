"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";
import PainelDisponibilidade, { Disponibilidade } from "@/components/PainelDisponibilidade";
import PainelCortes, { Servico } from "@/components/PainelCortes";

type Barbeiro = { id: string; nome: string; email: string; ehChefe: boolean };
type Financeiro = { totalGeral: number; totalDeAtendimentos: number; porBarbeiro: { barbeiroId: string; nome: string; total: number; quantidade: number }[] };
type MeuAgendamento = {
  id: string; status: string; data: string;
  cliente: { nome: string; email: string; whatsapp: string | null };
  servicos: { nomeServico: string }[];
  barbeiro?: { id: string };
  cancelamentoSolicitadoEm: string | null; motivoCancelamento: string | null;
  ocultoPeloBarbeiro: boolean;
  concluidoEm: string | null;
  observacoes: string | null;
};

const INTERVALO_POLLING_MS = 8000;

function nomesCortes(ag: MeuAgendamento) {
  return ag.servicos.map((s) => s.nomeServico).join(" + ");
}

function hojeBrasil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function DetalheCliente({ ag, aberto, onToggle }: { ag: MeuAgendamento; aberto: boolean; onToggle: () => void }) {
  return (
    <>
      <button onClick={onToggle} className="text-xs underline text-ink/50 mt-1">
        {aberto ? "Ocultar contato" : "Ver contato"}
      </button>
      {aberto && (
        <div className="mt-1 p-2 bg-line/30 rounded text-xs space-y-0.5">
          <p>{ag.cliente.email}</p>
          {ag.cliente.whatsapp ? (
            <a
              className="underline"
              href={`https://wa.me/${ag.cliente.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Falar no WhatsApp ({ag.cliente.whatsapp})
            </a>
          ) : (
            <p className="text-ink/40">Cliente não cadastrou WhatsApp</p>
          )}
        </div>
      )}
    </>
  );
}

export default function PainelAdmin() {
  const router = useRouter();
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [financeiro, setFinanceiro] = useState<Financeiro | null>(null);
  const [periodo, setPeriodo] = useState<"dia" | "mes" | "ano">("mes");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [novoBarbeiroNome, setNovoBarbeiroNome] = useState("");
  const [novoBarbeiroEmail, setNovoBarbeiroEmail] = useState("");
  const [salvandoBarbeiro, setSalvandoBarbeiro] = useState(false);
  const [alternandoChefeId, setAlternandoChefeId] = useState<string | null>(null);

  // "Eu também atendo": o dono pode ativar isso pra cortar cabelo também
  // (ver regra de negócio 10) — quando ativo, ganha a própria agenda
  // (disponibilidade + pedidos pendentes/cancelamento), igual um barbeiro.
  const [meuId, setMeuId] = useState<string | null>(null);
  const [atendoComoBarbeiro, setAtendoComoBarbeiro] = useState(false);
  const [meuFotoUrl, setMeuFotoUrl] = useState("");
  const [minhaNovaFoto, setMinhaNovaFoto] = useState<File | null>(null);
  const [alternandoAtendimento, setAlternandoAtendimento] = useState(false);
  const [minhaDisponibilidade, setMinhaDisponibilidade] = useState<Disponibilidade[]>([]);
  const [meusAgendaHoje, setMeusAgendaHoje] = useState<MeuAgendamento[]>([]);
  const [meusPendentes, setMeusPendentes] = useState<MeuAgendamento[]>([]);
  const [meusPedidosCancelamento, setMeusPedidosCancelamento] = useState<MeuAgendamento[]>([]);
  const [meusAgendados, setMeusAgendados] = useState<MeuAgendamento[]>([]);
  const [meusConcluidos, setMeusConcluidos] = useState<MeuAgendamento[]>([]);
  const [meusCancelados, setMeusCancelados] = useState<MeuAgendamento[]>([]);
  const [mostrandoOcultos, setMostrandoOcultos] = useState(false);
  const [respondendoId, setRespondendoId] = useState<string | null>(null);
  const [meuWhatsapp, setMeuWhatsapp] = useState("");
  const [meuCallmebotApiKey, setMeuCallmebotApiKey] = useState("");
  const [salvandoContato, setSalvandoContato] = useState(false);
  const [detalhesExpandidos, setDetalhesExpandidos] = useState<Set<string>>(new Set());
  function alternarDetalhe(id: string) {
    setDetalhesExpandidos((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function enviarImagem(arquivo: File, pasta: "cortes" | "barbeiros"): Promise<string> {
    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("pasta", pasta);
    const resp = await fetch("/api/upload", { method: "POST", body: form });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Não foi possível enviar a imagem");
    return dados.url as string;
  }

  // Separado de carregarFinanceiro: barbeiros/serviços não dependem do
  // período do faturamento, então não faz sentido refazer essas duas
  // buscas (nem mostrar o spinner de página inteira) só porque o dono
  // trocou o filtro de dia/mês/ano.
  async function carregarBarbeirosEServicos(mostrarSpinner = true) {
    if (mostrarSpinner) setCarregando(true);
    const [bResp, sResp] = await Promise.all([fetch("/api/barbeiros"), fetch("/api/servicos")]);

    const semAcesso = [bResp, sResp].some((r) => r.status === 401 || r.status === 403);
    if (semAcesso) {
      router.push("/entrar");
      return;
    }
    if (!bResp.ok || !sResp.ok) {
      if (mostrarSpinner) {
        setErro("Não foi possível carregar os dados do painel.");
        setCarregando(false);
      }
      return;
    }

    const [b, s] = await Promise.all([bResp.json(), sResp.json()]);
    setBarbeiros(b.barbeiros || []);
    setServicos(s.servicos || []);
    if (mostrarSpinner) setCarregando(false);
  }

  async function carregarFinanceiro(periodoAtual: "dia" | "mes" | "ano") {
    const resp = await fetch(`/api/financeiro?periodo=${periodoAtual}`);
    if (resp.status === 401 || resp.status === 403) {
      router.push("/entrar");
      return;
    }
    if (!resp.ok) return;
    setFinanceiro(await resp.json());
  }

  useEffect(() => { carregarBarbeirosEServicos(); }, []);
  useEffect(() => { carregarFinanceiro(periodo); }, [periodo]);

  async function carregarPerfil() {
    const resp = await fetch("/api/perfil");
    if (!resp.ok) return;
    const d = await resp.json();
    setMeuId(d.usuario?.id ?? null);
    setAtendoComoBarbeiro(!!d.usuario?.atendeComoBarbeiro);
    setMeuWhatsapp(d.usuario?.whatsapp || "");
    setMeuCallmebotApiKey(d.usuario?.callmebotApiKey || "");
    setMeuFotoUrl(d.usuario?.fotoUrl || "");
  }

  useEffect(() => { carregarPerfil(); }, []);

  async function alternarAtendimento() {
    if (atendoComoBarbeiro && !window.confirm("Desativar o atendimento? Sua disponibilidade e pedidos pendentes como barbeiro continuam guardados, mas você deixa de aparecer pro cliente escolher até ativar de novo.")) {
      return;
    }
    setErro("");
    setSucesso("");
    setAlternandoAtendimento(true);
    const resp = await fetch("/api/perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ atendeComoBarbeiro: !atendoComoBarbeiro }),
    });
    setAlternandoAtendimento(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível atualizar isso");
      return;
    }
    setAtendoComoBarbeiro(!atendoComoBarbeiro);
  }

  async function salvarContatoWhatsapp(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setSalvandoContato(true);

    let fotoUrlParaSalvar = meuFotoUrl;
    if (minhaNovaFoto) {
      try {
        fotoUrlParaSalvar = await enviarImagem(minhaNovaFoto, "barbeiros");
      } catch (erro: any) {
        setSalvandoContato(false);
        setErro(erro.message || "Não foi possível enviar a foto");
        return;
      }
    }

    const resp = await fetch("/api/perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsapp: meuWhatsapp, callmebotApiKey: meuCallmebotApiKey, fotoUrl: fotoUrlParaSalvar }),
    });
    setSalvandoContato(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível salvar");
      return;
    }
    setMeuFotoUrl(fotoUrlParaSalvar);
    setMinhaNovaFoto(null);
    setSucesso("Salvo — você vai receber os avisos de agendamento por lá.");
  }

  async function carregarMinhaAgenda() {
    const sufixoOcultos = mostrandoOcultos ? "&mostrarOcultos=1" : "";
    const [dispResp, hojeResp, pendResp, confResp, concResp, cancResp] = await Promise.all([
      fetch("/api/disponibilidade"),
      fetch(`/api/agendamentos?data=${hojeBrasil()}`),
      fetch("/api/agendamentos?status=PENDENTE"),
      fetch("/api/agendamentos?status=CONFIRMADO"),
      fetch(`/api/agendamentos?status=CONCLUIDO${sufixoOcultos}`),
      fetch(`/api/agendamentos?status=CANCELADO${sufixoOcultos}`),
    ]);
    if (dispResp.ok) setMinhaDisponibilidade((await dispResp.json()).disponibilidades || []);
    if (hojeResp.ok) {
      const hoje = await hojeResp.json();
      setMeusAgendaHoje((hoje.agendamentos || []).filter((ag: MeuAgendamento) => ag.barbeiro?.id === meuId));
    }
    if (pendResp.ok && confResp.ok) {
      const [pend, conf] = await Promise.all([pendResp.json(), confResp.json()]);
      const pendentesLista: MeuAgendamento[] = (pend.agendamentos || []).filter((ag: MeuAgendamento) => ag.barbeiro?.id === meuId);
      const confirmadosLista: MeuAgendamento[] = (conf.agendamentos || []).filter((ag: MeuAgendamento) => ag.barbeiro?.id === meuId);
      setMeusPendentes(pendentesLista);
      setMeusAgendados([...confirmadosLista].sort((a, b) => a.data.localeCompare(b.data)));
      setMeusPedidosCancelamento(
        [...pendentesLista, ...confirmadosLista].filter((ag) => ag.cancelamentoSolicitadoEm)
      );
    }
    if (concResp.ok) {
      const conc = await concResp.json();
      const lista: MeuAgendamento[] = (conc.agendamentos || []).filter((ag: MeuAgendamento) => ag.barbeiro?.id === meuId);
      setMeusConcluidos(lista.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 20));
    }
    if (cancResp.ok) {
      const canc = await cancResp.json();
      const lista: MeuAgendamento[] = (canc.agendamentos || []).filter((ag: MeuAgendamento) => ag.barbeiro?.id === meuId);
      setMeusCancelados(lista.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 20));
    }
  }

  // Só carrega a própria agenda depois que o perfil confirmou o
  // atendimento ativo E já se sabe quem é o próprio id (senão o filtro
  // por barbeiro.id === meuId ficaria comparando com null).
  useEffect(() => {
    if (atendoComoBarbeiro && meuId) carregarMinhaAgenda();
  }, [atendoComoBarbeiro, meuId, mostrandoOcultos]);

  // Igual ao polling de barbeiro/page.tsx (mesmo INTERVALO_POLLING_MS) — sem
  // isso, um pedido novo de cliente só aparecia depois de um F5 manual,
  // diferente do painel do barbeiro, que já atualiza sozinho a cada 8s.
  useEffect(() => {
    if (!atendoComoBarbeiro || !meuId) return;
    const intervalo = setInterval(() => carregarMinhaAgenda(), INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, [atendoComoBarbeiro, meuId, mostrandoOcultos]);

  async function responderMeuPedido(id: string, status: "CONFIRMADO" | "RECUSADO") {
    setErro("");
    setSucesso("");
    setRespondendoId(id);
    const resp = await fetch(`/api/agendamentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setRespondendoId(null);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível responder esse pedido");
      return;
    }
    carregarMinhaAgenda();
  }

  // Marca um corte confirmado como concluído — pode ser antes do horário
  // marcado, ou em outro dia qualquer. O horário original volta a ficar
  // livre pra outro cliente.
  async function concluirMeuCorte(id: string) {
    setErro("");
    setSucesso("");
    setRespondendoId(id);
    const resp = await fetch(`/api/agendamentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CONCLUIDO" }),
    });
    setRespondendoId(null);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível concluir esse corte");
      return;
    }
    carregarMinhaAgenda();
  }

  // Some com um corte concluído/cancelado da própria visão (sem apagar do
  // banco) — ou desfaz isso quando "Mostrar ocultos" está ligado.
  async function ocultarMeuCorte(id: string, valor: boolean) {
    setErro("");
    setSucesso("");
    setRespondendoId(id);
    const resp = await fetch(`/api/agendamentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ocultar: valor }),
    });
    setRespondendoId(null);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível fazer isso");
      return;
    }
    carregarMinhaAgenda();
  }

  async function decidirMeuCancelamento(id: string, confirmar: boolean) {
    setErro("");
    setSucesso("");
    setRespondendoId(id);
    const resp = await fetch(`/api/agendamentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmar ? { status: "CANCELADO" } : { recusarCancelamento: true }),
    });
    setRespondendoId(null);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível processar esse pedido de cancelamento");
      return;
    }
    carregarMinhaAgenda();
  }

  async function adicionarBarbeiro(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setSalvandoBarbeiro(true);
    const resp = await fetch("/api/barbeiros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novoBarbeiroNome, email: novoBarbeiroEmail }),
    });
    setSalvandoBarbeiro(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível enviar o convite");
      return;
    }
    setNovoBarbeiroNome(""); setNovoBarbeiroEmail("");
    setSucesso("Convite enviado — ele(a) recebe um e-mail pra confirmar e criar a senha.");
    carregarBarbeirosEServicos(false);
  }

  async function alternarChefe(b: Barbeiro) {
    if (b.ehChefe && !window.confirm(`Remover ${b.nome} como chefe?`)) return;
    setErro("");
    setSucesso("");
    setAlternandoChefeId(b.id);
    const resp = await fetch(`/api/barbeiros/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ehChefe: !b.ehChefe }),
    });
    setAlternandoChefeId(null);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível atualizar esse barbeiro");
      return;
    }
    setSucesso(b.ehChefe ? "Barbeiro deixou de ser chefe." : "Barbeiro promovido a chefe.");
    carregarBarbeirosEServicos(false);
  }

  return (
    <>
      <Cabecalho />
      <main className="max-w-2xl mx-auto px-6 py-14 space-y-10">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="font-display text-3xl">Painel da barbearia</h1>
        <Link href="/barbeiro/desempenho" className="btn-secondary text-sm shrink-0">
          Visualizar dados da barbearia
        </Link>
      </div>

      {carregando ? (
        <p className="text-ink/60">Carregando...</p>
      ) : (
        <>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {sucesso && <p className="text-sm text-green-600">{sucesso}</p>}

      <section>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-medium">Faturamento</h2>
          <select className="input w-32" value={periodo} onChange={(e) => setPeriodo(e.target.value as any)}>
            <option value="dia">Hoje</option>
            <option value="mes">Este mês</option>
            <option value="ano">Este ano</option>
          </select>
        </div>
        {financeiro && (
          <div className="card">
            <p className="text-2xl mb-1">R$ {financeiro.totalGeral.toFixed(2)}</p>
            <p className="text-sm text-ink/60 mb-4">{financeiro.totalDeAtendimentos} atendimentos concluídos</p>
            <div className="space-y-2">
              {financeiro.porBarbeiro.map((b) => (
                <div key={b.barbeiroId} className="flex justify-between text-sm border-t border-line pt-2">
                  <span>{b.nome} <span className="text-ink/50">({b.quantidade} atendimentos)</span></span>
                  <span className="font-medium">R$ {b.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-3">Barbeiros</h2>
        <div className="space-y-2 mb-4">
          {barbeiros.map((b) => (
            <div key={b.id} className="card flex justify-between items-center">
              <div>
                <span>{b.nome}</span>
                {b.ehChefe && <span className="ml-2 text-xs text-accent">★ Chefe</span>}
                <span className="block text-sm text-ink/50">{b.email}</span>
              </div>
              <button
                className="text-sm text-ink/60 hover:text-ink"
                disabled={alternandoChefeId === b.id}
                onClick={() => alternarChefe(b)}
              >
                {alternandoChefeId === b.id ? "Atualizando..." : b.ehChefe ? "Remover como chefe" : "Tornar chefe"}
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={adicionarBarbeiro} className="card grid gap-2">
          <input className="input" placeholder="Nome do barbeiro" value={novoBarbeiroNome} onChange={(e) => setNovoBarbeiroNome(e.target.value)} required />
          <input className="input" type="email" placeholder="E-mail" value={novoBarbeiroEmail} onChange={(e) => setNovoBarbeiroEmail(e.target.value)} required />
          <p className="text-xs text-ink/50">
            Ele(a) recebe um e-mail pra confirmar e criar a própria senha.
          </p>
          <button className="btn-primary" disabled={salvandoBarbeiro}>
            {salvandoBarbeiro ? "Enviando convite..." : "Enviar convite"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-medium mb-3">Cortes e preços</h2>
        <PainelCortes
          servicos={servicos}
          barbeirosElegiveis={[
            ...(atendoComoBarbeiro && meuId ? [{ id: meuId, nome: "Eu mesmo" }] : []),
            ...barbeiros.map((b) => ({ id: b.id, nome: b.nome })),
          ]}
          recarregar={() => carregarBarbeirosEServicos(false)}
          onErro={setErro}
          onSucesso={setSucesso}
        />
      </section>

      <section>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-medium">Eu também atendo</h2>
          <button className="text-sm text-ink/60 hover:text-ink" disabled={alternandoAtendimento} onClick={alternarAtendimento}>
            {alternandoAtendimento ? "Atualizando..." : atendoComoBarbeiro ? "Desativar atendimento" : "Ativar atendimento"}
          </button>
        </div>
        <p className="text-sm text-ink/50 mb-3">
          Se você também corta cabelo, ative isso pra aparecer como opção pro cliente escolher, com sua própria
          disponibilidade e seus próprios pedidos de agendamento.
        </p>

        {atendoComoBarbeiro && (
          <>
            <div className="card mb-4 border-accent">
              <h3 className="font-medium mb-2">Foto de perfil</h3>
              <p className="text-xs text-ink/50 mb-3">
                Aparece pro cliente do mesmo jeito que a foto de um barbeiro contratado.
              </p>
              <form onSubmit={salvarContatoWhatsapp} className="space-y-4">
                <div className="flex items-center gap-4">
                  {meuFotoUrl && (
                    <Image src={meuFotoUrl} alt="Sua foto" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
                  )}
                  <div className="flex-1">
                    <label className="text-sm text-ink/60 mb-1 block" htmlFor="minhaFoto">Foto de perfil (opcional)</label>
                    <input
                      id="minhaFoto"
                      className="input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setMinhaNovaFoto(e.target.files?.[0] || null)}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Receber avisos no WhatsApp</h3>
                  <p className="text-xs text-ink/50 mb-3">
                    1. Salve o número <strong>+34 644 59 71 92</strong> nos seus contatos do WhatsApp.
                    <br />2. Mande pra ele a mensagem: <strong>I allow callmebot to send me messages</strong>
                    <br />3. Ele responde com sua chave (apikey) pessoal — cole ela abaixo, junto com o seu número.
                  </p>
                  <div className="grid gap-2">
                    <div>
                      <label className="text-sm text-ink/60 mb-1 block" htmlFor="meuWhatsapp">Seu WhatsApp</label>
                      <input
                        id="meuWhatsapp"
                        className="input"
                        placeholder="Seu WhatsApp (com DDD e país, só números)"
                        value={meuWhatsapp}
                        onChange={(e) => setMeuWhatsapp(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-ink/60 mb-1 block" htmlFor="meuCallmebotApiKey">Apikey do CallMeBot</label>
                      <input
                        id="meuCallmebotApiKey"
                        className="input"
                        placeholder="Apikey do CallMeBot"
                        value={meuCallmebotApiKey}
                        onChange={(e) => setMeuCallmebotApiKey(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <button className="btn-primary" disabled={salvandoContato}>
                  {salvandoContato ? "Salvando..." : "Salvar"}
                </button>
              </form>
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-medium text-ink/70 mb-2">Agendamentos de hoje</h3>
              {meusAgendaHoje.length === 0 && <p className="text-sm text-ink/50">Nada marcado pra hoje.</p>}
              <div className="space-y-2">
                {meusAgendaHoje.map((ag) => (
                  <div key={ag.id} className="card flex justify-between items-center">
                    <div>
                      <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                      <p className="text-sm text-ink/60">
                        {new Date(ag.data).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                        {" · "}{ag.status}
                      </p>
                      <DetalheCliente ag={ag} aberto={detalhesExpandidos.has(ag.id)} onToggle={() => alternarDetalhe(ag.id)} />
                    </div>
                    {ag.status === "PENDENTE" && (
                      <div className="flex gap-2">
                        <button className="btn-primary" disabled={respondendoId === ag.id} onClick={() => responderMeuPedido(ag.id, "CONFIRMADO")}>
                          {respondendoId === ag.id ? "Aceitando..." : "Aceitar"}
                        </button>
                        <button className="btn-secondary" disabled={respondendoId === ag.id} onClick={() => responderMeuPedido(ag.id, "RECUSADO")}>
                          {respondendoId === ag.id ? "Recusando..." : "Recusar"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {meusPedidosCancelamento.length > 0 && (
              <div className="space-y-3 mb-4">
                <h3 className="text-sm font-medium text-ink/70">Pedidos de cancelamento</h3>
                {meusPedidosCancelamento.map((ag) => (
                  <div key={ag.id} className="card border-amber-300">
                    <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                    <p className="text-sm text-ink/60">
                      {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </p>
                    <p className="text-sm text-ink/60 mt-1">Motivo: {ag.motivoCancelamento || "não informado"}</p>
                    <DetalheCliente ag={ag} aberto={detalhesExpandidos.has(ag.id)} onToggle={() => alternarDetalhe(ag.id)} />
                    <div className="flex gap-2 mt-3">
                      <button className="btn-primary" disabled={respondendoId === ag.id} onClick={() => decidirMeuCancelamento(ag.id, true)}>
                        {respondendoId === ag.id ? "Confirmando..." : "Confirmar cancelamento"}
                      </button>
                      <button className="btn-secondary" disabled={respondendoId === ag.id} onClick={() => decidirMeuCancelamento(ag.id, false)}>
                        {respondendoId === ag.id ? "Mantendo..." : "Manter agendamento"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 mb-4">
              <h3 className="text-sm font-medium text-ink/70">Meus pedidos pendentes</h3>
              {meusPendentes.length === 0 && <p className="text-sm text-ink/50">Nenhum pedido pendente.</p>}
              {meusPendentes.map((ag) => (
                <div key={ag.id} className="card flex justify-between items-center">
                  <div>
                    <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                    <p className="text-sm text-ink/60">
                      {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </p>
                    <DetalheCliente ag={ag} aberto={detalhesExpandidos.has(ag.id)} onToggle={() => alternarDetalhe(ag.id)} />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary" disabled={respondendoId === ag.id} onClick={() => responderMeuPedido(ag.id, "CONFIRMADO")}>
                      {respondendoId === ag.id ? "Aceitando..." : "Aceitar"}
                    </button>
                    <button className="btn-secondary" disabled={respondendoId === ag.id} onClick={() => responderMeuPedido(ag.id, "RECUSADO")}>
                      {respondendoId === ag.id ? "Recusando..." : "Recusar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 mb-4">
              <h3 className="text-sm font-medium text-ink/70">Meus cortes agendados</h3>
              {meusAgendados.length === 0 && <p className="text-sm text-ink/50">Nada confirmado no momento.</p>}
              {meusAgendados.map((ag) => (
                <div key={ag.id} className="card flex justify-between items-center">
                  <div>
                    <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                    <p className="text-sm text-ink/60">
                      {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </p>
                    <DetalheCliente ag={ag} aberto={detalhesExpandidos.has(ag.id)} onToggle={() => alternarDetalhe(ag.id)} />
                  </div>
                  <button className="btn-secondary" disabled={respondendoId === ag.id} onClick={() => concluirMeuCorte(ag.id)}>
                    {respondendoId === ag.id ? "Concluindo..." : "Marcar concluído"}
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end mb-2">
              <label className="flex items-center gap-2 text-sm text-ink/60">
                <input
                  type="checkbox"
                  checked={mostrandoOcultos}
                  onChange={(e) => setMostrandoOcultos(e.target.checked)}
                />
                Mostrar ocultos
              </label>
            </div>

            <div className="space-y-3 mb-4">
              <h3 className="text-sm font-medium text-ink/70">Meus cortes concluídos</h3>
              {meusConcluidos.length === 0 && <p className="text-sm text-ink/50">Nenhum corte concluído ainda.</p>}
              {meusConcluidos.map((ag) => (
                <div key={ag.id} className={`card flex justify-between items-start ${ag.ocultoPeloBarbeiro ? "opacity-50" : ""}`}>
                  <div>
                    <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                    <p className="text-sm text-ink/60">
                      {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </p>
                    {ag.observacoes && (
                      <p className="text-xs text-amber-700 mt-1">{ag.observacoes}</p>
                    )}
                  </div>
                  <button
                    className="text-sm text-ink/40 hover:text-ink shrink-0"
                    disabled={respondendoId === ag.id}
                    onClick={() => ocultarMeuCorte(ag.id, !ag.ocultoPeloBarbeiro)}
                    title={ag.ocultoPeloBarbeiro ? "Desocultar" : "Ocultar da minha visão"}
                  >
                    {respondendoId === ag.id
                      ? ag.ocultoPeloBarbeiro ? "Mostrando..." : "Ocultando..."
                      : ag.ocultoPeloBarbeiro ? "Desocultar" : "Ocultar"}
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-3 mb-4">
              <h3 className="text-sm font-medium text-ink/70">Meus cortes cancelados</h3>
              {meusCancelados.length === 0 && <p className="text-sm text-ink/50">Nenhum corte cancelado.</p>}
              {meusCancelados.map((ag) => (
                <div key={ag.id} className={`card flex justify-between items-start ${ag.ocultoPeloBarbeiro ? "opacity-50" : ""}`}>
                  <div>
                    <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                    <p className="text-sm text-ink/60">
                      {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </p>
                    <p className="text-sm text-ink/60 mt-1">Motivo: {ag.motivoCancelamento || "não informado"}</p>
                  </div>
                  <button
                    className="text-sm text-ink/40 hover:text-ink shrink-0"
                    disabled={respondendoId === ag.id}
                    onClick={() => ocultarMeuCorte(ag.id, !ag.ocultoPeloBarbeiro)}
                    title={ag.ocultoPeloBarbeiro ? "Desocultar" : "Ocultar da minha visão"}
                  >
                    {respondendoId === ag.id
                      ? ag.ocultoPeloBarbeiro ? "Mostrando..." : "Ocultando..."
                      : ag.ocultoPeloBarbeiro ? "Desocultar" : "Ocultar"}
                  </button>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-medium text-ink/70 mb-2">Minha disponibilidade</h3>
            <PainelDisponibilidade
              disponibilidades={minhaDisponibilidade}
              recarregar={carregarMinhaAgenda}
              onErro={setErro}
              onSucesso={setSucesso}
            />
            {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
            {sucesso && <p className="text-sm text-green-600 mt-2">{sucesso}</p>}
          </>
        )}
      </section>
        </>
      )}
      </main>
    </>
  );
}
