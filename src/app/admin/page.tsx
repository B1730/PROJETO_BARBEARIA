"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Cabecalho from "@/components/Cabecalho";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type Barbeiro = { id: string; nome: string; email: string; ehChefe: boolean };
type Servico = {
  id: string; nome: string; precoBase: string; duracaoMinutos: number; imagemUrl: string | null;
  barbeiros: { barbeiroId: string }[];
};
type Financeiro = { totalGeral: number; totalDeAtendimentos: number; porBarbeiro: { barbeiroId: string; nome: string; total: number; quantidade: number }[] };
type Disponibilidade = { id: string; diaDaSemana: number; horaInicio: string; horaFim: string };
type MeuAgendamento = {
  id: string; status: string; data: string;
  cliente: { nome: string; email: string; whatsapp: string | null };
  servicos: { nomeServico: string }[];
  barbeiro?: { id: string };
  cancelamentoSolicitadoEm: string | null; motivoCancelamento: string | null;
};

function nomesCortes(ag: MeuAgendamento) {
  return ag.servicos.map((s) => s.nomeServico).join(" + ");
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

  const [novoServicoNome, setNovoServicoNome] = useState("");
  const [novoServicoPreco, setNovoServicoPreco] = useState("");
  const [novoServicoDuracao, setNovoServicoDuracao] = useState("30");
  const [novoServicoImagem, setNovoServicoImagem] = useState<File | null>(null);
  const [salvandoServico, setSalvandoServico] = useState(false);

  // "Eu também atendo": o dono pode ativar isso pra cortar cabelo também
  // (ver regra de negócio 10) — quando ativo, ganha a própria agenda
  // (disponibilidade + pedidos pendentes/cancelamento), igual um barbeiro.
  const [meuId, setMeuId] = useState<string | null>(null);
  const [atendoComoBarbeiro, setAtendoComoBarbeiro] = useState(false);
  const [alternandoAtendimento, setAlternandoAtendimento] = useState(false);
  const [minhaDisponibilidade, setMinhaDisponibilidade] = useState<Disponibilidade[]>([]);
  const [novoDia, setNovoDia] = useState(1);
  const [novaHoraIni, setNovaHoraIni] = useState("09:00");
  const [novaHoraFim, setNovaHoraFim] = useState("18:00");
  const [salvandoDisponibilidade, setSalvandoDisponibilidade] = useState(false);
  const [meusPendentes, setMeusPendentes] = useState<MeuAgendamento[]>([]);
  const [meusPedidosCancelamento, setMeusPedidosCancelamento] = useState<MeuAgendamento[]>([]);
  const [meusAgendados, setMeusAgendados] = useState<MeuAgendamento[]>([]);
  const [meusConcluidos, setMeusConcluidos] = useState<MeuAgendamento[]>([]);
  const [meusCancelados, setMeusCancelados] = useState<MeuAgendamento[]>([]);
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
  }

  useEffect(() => { carregarPerfil(); }, []);

  async function alternarAtendimento() {
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
    const resp = await fetch("/api/perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsapp: meuWhatsapp, callmebotApiKey: meuCallmebotApiKey }),
    });
    setSalvandoContato(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível salvar");
      return;
    }
    setSucesso("WhatsApp salvo — você vai receber os avisos de agendamento por lá.");
  }

  async function carregarMinhaAgenda() {
    const [dispResp, pendResp, confResp, concResp, cancResp] = await Promise.all([
      fetch("/api/disponibilidade"),
      fetch("/api/agendamentos?status=PENDENTE"),
      fetch("/api/agendamentos?status=CONFIRMADO"),
      fetch("/api/agendamentos?status=CONCLUIDO"),
      fetch("/api/agendamentos?status=CANCELADO"),
    ]);
    if (dispResp.ok) setMinhaDisponibilidade((await dispResp.json()).disponibilidades || []);
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
  }, [atendoComoBarbeiro, meuId]);

  async function adicionarMinhaDisponibilidade(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvandoDisponibilidade(true);
    const resp = await fetch("/api/disponibilidade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diaDaSemana: novoDia, horaInicio: novaHoraIni, horaFim: novaHoraFim }),
    });
    setSalvandoDisponibilidade(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível adicionar essa disponibilidade");
      return;
    }
    carregarMinhaAgenda();
  }

  async function removerMinhaDisponibilidade(id: string) {
    setErro("");
    const resp = await fetch(`/api/disponibilidade/${id}`, { method: "DELETE" });
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível remover essa disponibilidade");
      return;
    }
    carregarMinhaAgenda();
  }

  async function responderMeuPedido(id: string, status: "CONFIRMADO" | "RECUSADO") {
    setErro("");
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

  async function decidirMeuCancelamento(id: string, confirmar: boolean) {
    setErro("");
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

  async function adicionarServico(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setSalvandoServico(true);

    let imagemUrl: string | undefined;
    if (novoServicoImagem) {
      try {
        imagemUrl = await enviarImagem(novoServicoImagem, "cortes");
      } catch (erro: any) {
        setSalvandoServico(false);
        setErro(erro.message || "Não foi possível enviar a imagem");
        return;
      }
    }

    const resp = await fetch("/api/servicos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: novoServicoNome,
        precoBase: Number(novoServicoPreco),
        duracaoMinutos: Number(novoServicoDuracao),
        imagemUrl,
      }),
    });
    setSalvandoServico(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível adicionar esse corte");
      return;
    }
    setNovoServicoNome(""); setNovoServicoPreco(""); setNovoServicoDuracao("30"); setNovoServicoImagem(null);
    setSucesso("Corte cadastrado.");
    carregarBarbeirosEServicos(false);
  }

  async function removerServico(id: string) {
    setErro("");
    const resp = await fetch(`/api/servicos/${id}`, { method: "DELETE" });
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível excluir esse corte");
      return;
    }
    carregarBarbeirosEServicos(false);
  }

  if (carregando) {
    return (
      <>
        <Cabecalho />
        <main className="max-w-2xl mx-auto px-6 py-20">Carregando...</main>
      </>
    );
  }

  return (
    <>
      <Cabecalho />
      <main className="max-w-2xl mx-auto px-6 py-14 space-y-10">
      <h1 className="font-display text-3xl">Painel da barbearia</h1>
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
                {alternandoChefeId === b.id ? "..." : b.ehChefe ? "Remover como chefe" : "Tornar chefe"}
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
        <div className="space-y-2 mb-4">
          {servicos.map((s) => (
            <div key={s.id} className="card flex justify-between items-center">
              <div className="flex items-center gap-3">
                {s.imagemUrl && (
                  <Image src={s.imagemUrl} alt={s.nome} width={40} height={40} className="h-10 w-10 rounded-md object-cover" />
                )}
                <span>{s.nome} <span className="text-ink/50 text-sm">({s.duracaoMinutos} min)</span></span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">R$ {Number(s.precoBase).toFixed(2)}</span>
                <button className="text-sm text-red-600" onClick={() => removerServico(s.id)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={adicionarServico} className="card grid gap-2">
          <input className="input" placeholder="Nome do corte" value={novoServicoNome} onChange={(e) => setNovoServicoNome(e.target.value)} required />
          <input className="input" type="number" step="0.01" placeholder="Preço (R$)" value={novoServicoPreco} onChange={(e) => setNovoServicoPreco(e.target.value)} required />
          <input className="input" type="number" placeholder="Duração (minutos)" value={novoServicoDuracao} onChange={(e) => setNovoServicoDuracao(e.target.value)} required />
          <div>
            <label className="text-sm text-ink/60 mb-1 block">Foto do corte (opcional)</label>
            <input
              className="input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setNovoServicoImagem(e.target.files?.[0] || null)}
            />
          </div>
          <button className="btn-primary" disabled={salvandoServico}>
            {salvandoServico ? "Adicionando..." : "Adicionar corte"}
          </button>
        </form>
      </section>

      <section>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-medium">Eu também atendo</h2>
          <button className="text-sm text-ink/60 hover:text-ink" disabled={alternandoAtendimento} onClick={alternarAtendimento}>
            {alternandoAtendimento ? "..." : atendoComoBarbeiro ? "Desativar atendimento" : "Ativar atendimento"}
          </button>
        </div>
        <p className="text-sm text-ink/50 mb-3">
          Se você também corta cabelo, ative isso pra aparecer como opção pro cliente escolher, com sua própria
          disponibilidade e seus próprios pedidos de agendamento.
        </p>

        {atendoComoBarbeiro && (
          <>
            <div className="card mb-4 border-accent">
              <h3 className="font-medium mb-2">Receber avisos no WhatsApp</h3>
              <p className="text-xs text-ink/50 mb-3">
                1. Salve o número <strong>+34 644 59 71 92</strong> nos seus contatos do WhatsApp.
                <br />2. Mande pra ele a mensagem: <strong>I allow callmebot to send me messages</strong>
                <br />3. Ele responde com sua chave (apikey) pessoal — cole ela abaixo, junto com o seu número.
              </p>
              <form onSubmit={salvarContatoWhatsapp} className="grid gap-2">
                <input
                  className="input"
                  placeholder="Seu WhatsApp (com DDD e país, só números)"
                  value={meuWhatsapp}
                  onChange={(e) => setMeuWhatsapp(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Apikey do CallMeBot"
                  value={meuCallmebotApiKey}
                  onChange={(e) => setMeuCallmebotApiKey(e.target.value)}
                />
                <button className="btn-primary" disabled={salvandoContato}>
                  {salvandoContato ? "Salvando..." : "Salvar WhatsApp"}
                </button>
              </form>
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
                        {respondendoId === ag.id ? "..." : "Confirmar cancelamento"}
                      </button>
                      <button className="btn-secondary" disabled={respondendoId === ag.id} onClick={() => decidirMeuCancelamento(ag.id, false)}>
                        {respondendoId === ag.id ? "..." : "Manter agendamento"}
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
                      {respondendoId === ag.id ? "..." : "Aceitar"}
                    </button>
                    <button className="btn-secondary" disabled={respondendoId === ag.id} onClick={() => responderMeuPedido(ag.id, "RECUSADO")}>
                      {respondendoId === ag.id ? "..." : "Recusar"}
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
                    {respondendoId === ag.id ? "..." : "Marcar concluído"}
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-3 mb-4">
              <h3 className="text-sm font-medium text-ink/70">Meus cortes concluídos</h3>
              {meusConcluidos.length === 0 && <p className="text-sm text-ink/50">Nenhum corte concluído ainda.</p>}
              {meusConcluidos.map((ag) => (
                <div key={ag.id} className="card">
                  <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                  <p className="text-sm text-ink/60">
                    {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-3 mb-4">
              <h3 className="text-sm font-medium text-ink/70">Meus cortes cancelados</h3>
              {meusCancelados.length === 0 && <p className="text-sm text-ink/50">Nenhum corte cancelado.</p>}
              {meusCancelados.map((ag) => (
                <div key={ag.id} className="card">
                  <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                  <p className="text-sm text-ink/60">
                    {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                  <p className="text-sm text-ink/60 mt-1">Motivo: {ag.motivoCancelamento || "não informado"}</p>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-medium text-ink/70 mb-2">Minha disponibilidade</h3>
            <div className="space-y-2 mb-4">
              {minhaDisponibilidade.map((d) => (
                <div key={d.id} className="card flex justify-between items-center">
                  <span>{DIAS[d.diaDaSemana]}: {d.horaInicio} às {d.horaFim}</span>
                  <button className="text-sm text-red-600" onClick={() => removerMinhaDisponibilidade(d.id)}>Remover</button>
                </div>
              ))}
            </div>
            <form onSubmit={adicionarMinhaDisponibilidade} className="card flex flex-wrap gap-2 items-end">
              <select className="input" value={novoDia} onChange={(e) => setNovoDia(Number(e.target.value))}>
                {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
              <input type="time" step={1800} className="input" value={novaHoraIni} onChange={(e) => setNovaHoraIni(e.target.value)} />
              <input type="time" step={1800} className="input" value={novaHoraFim} onChange={(e) => setNovaHoraFim(e.target.value)} />
              <button className="btn-primary" disabled={salvandoDisponibilidade}>
                {salvandoDisponibilidade ? "Adicionando..." : "Adicionar"}
              </button>
            </form>
            {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
            {sucesso && <p className="text-sm text-green-600 mt-2">{sucesso}</p>}
          </>
        )}
      </section>
      </main>
    </>
  );
}
