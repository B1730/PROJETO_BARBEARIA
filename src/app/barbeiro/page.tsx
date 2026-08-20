"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: "Aguardando",
  CONFIRMADO: "Confirmado",
  RECUSADO: "Recusado",
  CANCELADO: "Cancelado",
  CONCLUIDO: "Concluído",
};
const COR_STATUS: Record<string, string> = {
  PENDENTE: "text-amber-600",
  CONFIRMADO: "text-green-600",
  RECUSADO: "text-red-600",
  CANCELADO: "text-ink/40",
  CONCLUIDO: "text-ink/60",
};
const INTERVALO_POLLING_MS = 8000;

function hojeBrasil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function diaBrasilDe(dataIso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dataIso));
}
function formatarDataCurta(dataIso: string) {
  return new Date(dataIso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}
function formatarHora(dataIso: string) {
  return new Date(dataIso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

type Agendamento = {
  id: string; status: string; data: string;
  cliente: { nome: string }; servico: { nome: string }; precoCobrado: string;
  barbeiro?: { id: string; nome: string };
  cancelamentoSolicitadoEm: string | null; motivoCancelamento: string | null;
};
type Disponibilidade = { id: string; diaDaSemana: number; horaInicio: string; horaFim: string };
type Servico = {
  id: string; nome: string; precoBase: string; duracaoMinutos: number; imagemUrl: string | null;
  barbeiros: { barbeiroId: string; preco: string }[];
};
type BarbeiroEquipe = { id: string; nome: string; email: string; ehChefe: boolean };
type Financeiro = { totalGeral: number; totalDeAtendimentos: number; porBarbeiro: { barbeiroId: string; nome: string; total: number; quantidade: number }[] };

export default function PainelBarbeiro() {
  const router = useRouter();
  const [pendentes, setPendentes] = useState<Agendamento[]>([]);
  const [pedidosCancelamento, setPedidosCancelamento] = useState<Agendamento[]>([]);
  const [agendaHoje, setAgendaHoje] = useState<Agendamento[]>([]);
  const [proximos, setProximos] = useState<Agendamento[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<Disponibilidade[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [financeiro, setFinanceiro] = useState<{ totalGeral: number; totalDeAtendimentos: number } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [novoDia, setNovoDia] = useState(1);
  const [novaHoraIni, setNovaHoraIni] = useState("09:00");
  const [novaHoraFim, setNovaHoraFim] = useState("18:00");
  const [salvandoDisponibilidade, setSalvandoDisponibilidade] = useState(false);
  const [novoServicoNome, setNovoServicoNome] = useState("");
  const [novoServicoPreco, setNovoServicoPreco] = useState("");
  const [novoServicoDuracao, setNovoServicoDuracao] = useState("30");
  const [novoServicoImagem, setNovoServicoImagem] = useState<File | null>(null);
  const [salvandoServico, setSalvandoServico] = useState(false);
  const [respondendoId, setRespondendoId] = useState<string | null>(null);
  const [meuId, setMeuId] = useState<string | null>(null);
  const [ehChefe, setEhChefe] = useState(false);
  const [cortesHoje, setCortesHoje] = useState<number | null>(null);

  const [equipePeriodo, setEquipePeriodo] = useState<"dia" | "mes" | "ano">("mes");
  const [equipeBarbeiros, setEquipeBarbeiros] = useState<BarbeiroEquipe[]>([]);
  const [equipeAgendaHoje, setEquipeAgendaHoje] = useState<Agendamento[]>([]);
  const [equipeFinanceiro, setEquipeFinanceiro] = useState<Financeiro | null>(null);
  const [novoContratadoNome, setNovoContratadoNome] = useState("");
  const [novoContratadoEmail, setNovoContratadoEmail] = useState("");
  const [salvandoContratado, setSalvandoContratado] = useState(false);
  const [barbeiroSelecionado, setBarbeiroSelecionado] = useState<BarbeiroEquipe | null>(null);
  const [agendaSelecionado, setAgendaSelecionado] = useState<Agendamento[]>([]);
  const [carregandoSelecionado, setCarregandoSelecionado] = useState(false);

  async function enviarImagem(arquivo: File, pasta: "cortes" | "barbeiros"): Promise<string> {
    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("pasta", pasta);
    const resp = await fetch("/api/upload", { method: "POST", body: form });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Não foi possível enviar a imagem");
    return dados.url as string;
  }

  useEffect(() => {
    fetch("/api/auth/sessao").then((r) => r.ok && r.json()).then((d) => {
      if (!d) return;
      setMeuId(d.usuario.id);
      setEhChefe(!!d.usuario.ehChefe);
    });
  }, []);

  // Só os agendamentos (pedidos pendentes, agenda de hoje, confirmados) —
  // o que realmente muda a cada instante e por isso vale a pena pollar a
  // cada 8s (ver useEffect do intervalo mais abaixo). Disponibilidade,
  // serviços e faturamento ficaram em carregarDadosEstaveis(), que só
  // roda uma vez no carregamento inicial e depois de uma ação do próprio
  // barbeiro que muda cada um deles — repetir essas três buscas a cada 8s
  // era refazer trabalho que quase nunca muda (faturamento, em particular,
  // só muda quando um agendamento vira CONCLUIDO, o que hoje não acontece
  // em lugar nenhum do app).
  async function carregarAgendamentos(mostrarSpinner = true) {
    if (mostrarSpinner) setCarregando(true);
    const [pendResp, hojeResp, confResp] = await Promise.all([
      fetch("/api/agendamentos?status=PENDENTE"),
      fetch(`/api/agendamentos?data=${hojeBrasil()}`),
      fetch("/api/agendamentos?status=CONFIRMADO"),
    ]);

    const semAcesso = [pendResp, hojeResp, confResp].some((r) => r.status === 401 || r.status === 403);
    if (semAcesso) {
      router.push("/entrar");
      return;
    }
    if (!pendResp.ok || !hojeResp.ok || !confResp.ok) {
      if (mostrarSpinner) {
        setErro("Não foi possível carregar os dados do painel.");
        setCarregando(false);
      }
      return;
    }

    const [pend, hoje, conf] = await Promise.all([pendResp.json(), hojeResp.json(), confResp.json()]);
    const pendentesLista: Agendamento[] = pend.agendamentos || [];
    setPendentes(pendentesLista);
    setAgendaHoje(hoje.agendamentos || []);

    // Próximos agendamentos (dias depois de hoje) — pra saber o que vem
    // por aí sem precisar ficar trocando de dia. "Agendamentos de hoje"
    // já cobre o dia de hoje, então aqui só entra o que é de outro dia.
    const confirmadosLista: Agendamento[] = conf.agendamentos || [];
    const hojeStr = hojeBrasil();
    const proximosLista = [...pendentesLista, ...confirmadosLista]
      .filter((ag) => diaBrasilDe(ag.data) > hojeStr)
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(0, 10);
    setProximos(proximosLista);

    // Pedidos de cancelamento do cliente ficam em aberto em qualquer
    // agendamento PENDENTE ou CONFIRMADO (ver POST /api/agendamentos/[id]/cancelar) —
    // não é um status à parte, é uma marca em cima do que já existe.
    setPedidosCancelamento(
      [...pendentesLista, ...confirmadosLista]
        .filter((ag) => ag.cancelamentoSolicitadoEm)
        .sort((a, b) => a.data.localeCompare(b.data))
    );

    if (mostrarSpinner) setCarregando(false);
  }

  // Disponibilidade/serviços/faturamento — só mudam por uma ação do próprio
  // barbeiro nesta tela, que já chama isso de novo depois de salvar. Fora
  // do polling de 8s de propósito (ver comentário acima).
  async function carregarDadosEstaveis() {
    const [dispResp, finResp, finHojeResp, servResp] = await Promise.all([
      fetch("/api/disponibilidade"),
      fetch("/api/financeiro?periodo=mes"),
      fetch("/api/financeiro?periodo=dia"),
      fetch("/api/servicos"),
    ]);
    if (!dispResp.ok || !finResp.ok || !finHojeResp.ok || !servResp.ok) return;
    const [disp, fin, finHoje, serv] = await Promise.all([
      dispResp.json(), finResp.json(), finHojeResp.json(), servResp.json(),
    ]);
    setDisponibilidades(disp.disponibilidades || []);
    setFinanceiro(fin);
    setCortesHoje(finHoje.totalDeAtendimentos ?? null);
    setServicos(serv.servicos || []);
  }

  useEffect(() => { carregarAgendamentos(true); carregarDadosEstaveis(); }, []);

  // useCallback com equipePeriodo na dependência — sem isso, a referência
  // dessa função usada dentro do setInterval de polling (mais abaixo)
  // ficava congelada no equipePeriodo de quando o efeito rodou a primeira
  // vez (sempre "mes"), e cada poll voltava o faturamento da equipe pro
  // período errado mesmo depois do chefe trocar o filtro.
  const carregarEquipe = useCallback(async () => {
    const [bResp, aResp, fResp] = await Promise.all([
      fetch("/api/barbeiros"),
      fetch(`/api/agendamentos?data=${hojeBrasil()}&equipe=1`),
      fetch(`/api/financeiro?periodo=${equipePeriodo}&equipe=1`),
    ]);
    if (!bResp.ok || !aResp.ok || !fResp.ok) return;
    const [b, a, f] = await Promise.all([bResp.json(), aResp.json(), fResp.json()]);
    setEquipeBarbeiros(b.barbeiros || []);
    setEquipeAgendaHoje(a.agendamentos || []);
    setEquipeFinanceiro(f);
  }, [equipePeriodo]);

  useEffect(() => { if (ehChefe) carregarEquipe(); }, [ehChefe, equipePeriodo, carregarEquipe]);

  // Agenda de um barbeiro contratado específico — só os agendamentos que
  // ainda não aconteceram (pendente/confirmado), pra saber o que ele tem
  // marcado sem precisar mexer no filtro de período. Clicar de novo no
  // mesmo barbeiro fecha a visualização.
  async function verAgendaDoBarbeiro(b: BarbeiroEquipe) {
    if (barbeiroSelecionado?.id === b.id) {
      setBarbeiroSelecionado(null);
      setAgendaSelecionado([]);
      return;
    }
    setBarbeiroSelecionado(b);
    setCarregandoSelecionado(true);
    const [pResp, cResp] = await Promise.all([
      fetch(`/api/agendamentos?barbeiroId=${b.id}&status=PENDENTE`),
      fetch(`/api/agendamentos?barbeiroId=${b.id}&status=CONFIRMADO`),
    ]);
    setCarregandoSelecionado(false);
    if (!pResp.ok || !cResp.ok) {
      setErro("Não foi possível carregar a agenda desse barbeiro");
      return;
    }
    const [p, c] = await Promise.all([pResp.json(), cResp.json()]);
    const lista: Agendamento[] = [...(p.agendamentos || []), ...(c.agendamentos || [])].sort((a, b2) =>
      a.data.localeCompare(b2.data)
    );
    setAgendaSelecionado(lista);
  }

  async function contratarBarbeiro(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setSalvandoContratado(true);
    const resp = await fetch("/api/barbeiros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novoContratadoNome, email: novoContratadoEmail }),
    });
    setSalvandoContratado(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível enviar o convite");
      return;
    }
    setNovoContratadoNome(""); setNovoContratadoEmail("");
    setSucesso("Convite enviado — ele(a) recebe um e-mail pra confirmar e criar a senha.");
    carregarEquipe();
  }

  useEffect(() => {
    // Faz o pedido do cliente aparecer sozinho na agenda, sem precisar de reload.
    // Pro chefe, também atualiza a agenda/faturamento da equipe — sem isso,
    // "Minha equipe" só mudava quando o chefe trocava o filtro de período ou
    // recarregava a página manualmente.
    const intervalo = setInterval(() => {
      carregarAgendamentos(false);
      if (ehChefe) carregarEquipe();
    }, INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, [ehChefe, carregarEquipe]);

  async function responder(id: string, status: "CONFIRMADO" | "RECUSADO") {
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
    carregarAgendamentos(false);
  }

  // Decisão do barbeiro sobre um pedido de cancelamento do cliente: ou
  // confirma (o agendamento vira CANCELADO de vez) ou recusa (mantém o
  // agendamento como estava, sem mudar o status) — depois de conversar
  // com o cliente pra entender o motivo.
  async function decidirCancelamento(id: string, confirmar: boolean) {
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
    carregarAgendamentos(false);
  }

  async function adicionarDisponibilidade(e: React.FormEvent) {
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
    carregarDadosEstaveis();
  }

  async function removerDisponibilidade(id: string) {
    setErro("");
    const resp = await fetch(`/api/disponibilidade/${id}`, { method: "DELETE" });
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível remover essa disponibilidade");
      return;
    }
    carregarDadosEstaveis();
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
      setErro(dados.erro || "Não foi possível cadastrar esse corte");
      return;
    }
    setNovoServicoNome(""); setNovoServicoPreco(""); setNovoServicoDuracao("30"); setNovoServicoImagem(null);
    setSucesso("Corte cadastrado — só aparece pra você agendar.");
    carregarDadosEstaveis();
  }

  if (carregando) {
    return (
      <>
        <Cabecalho />
        <main className="max-w-2xl mx-auto px-6 py-20 text-ink/60">Carregando painel...</main>
      </>
    );
  }

  return (
    <>
      <Cabecalho />
      <main className="max-w-2xl mx-auto px-6 py-14 space-y-10">
      <h1 className="font-display text-3xl">Painel do barbeiro</h1>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {sucesso && <p className="text-sm text-green-600">{sucesso}</p>}

      {financeiro && (
        <section className="card">
          <h2 className="font-medium mb-1">Faturamento do mês</h2>
          <p className="text-2xl">R$ {financeiro.totalGeral.toFixed(2)}</p>
          <p className="text-sm text-ink/60">
            {financeiro.totalDeAtendimentos} atendimentos concluídos no mês
            {cortesHoje !== null && ` · ${cortesHoje} hoje`}
          </p>
        </section>
      )}

      <section>
        <h2 className="font-medium mb-3">Agendamentos de hoje</h2>
        {agendaHoje.length === 0 && <p className="text-sm text-ink/50">Nada marcado pra hoje.</p>}
        <div className="space-y-3">
          {agendaHoje.map((ag) => (
            <div key={ag.id} className="card flex justify-between items-center">
              <div>
                <p className="font-medium">{ag.cliente.nome} — {ag.servico.nome}</p>
                <p className="text-sm text-ink/60">
                  {new Date(ag.data).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  <span className={COR_STATUS[ag.status] || ""}>{ROTULO_STATUS[ag.status] || ag.status}</span>
                </p>
              </div>
              {ag.status === "PENDENTE" && (
                <div className="flex gap-2">
                  <button className="btn-primary" disabled={respondendoId === ag.id} onClick={() => responder(ag.id, "CONFIRMADO")}>
                    {respondendoId === ag.id ? "..." : "Aceitar"}
                  </button>
                  <button className="btn-secondary" disabled={respondendoId === ag.id} onClick={() => responder(ag.id, "RECUSADO")}>
                    {respondendoId === ag.id ? "..." : "Recusar"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-medium mb-3">Próximos agendamentos</h2>
        {proximos.length === 0 ? (
          <p className="text-sm text-ink/50">Nada marcado além de hoje, por enquanto.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {proximos.map((ag) => (
              <div key={ag.id} className="card shrink-0 w-48">
                <p className="text-xs text-ink/50 mb-1">{formatarDataCurta(ag.data)} · {formatarHora(ag.data)}</p>
                <p className="font-medium text-sm">{ag.cliente.nome}</p>
                <p className="text-sm text-ink/60">{ag.servico.nome}</p>
                <p className={`text-xs mt-1 ${COR_STATUS[ag.status] || ""}`}>{ROTULO_STATUS[ag.status] || ag.status}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-3">Pedidos aguardando confirmação</h2>
        {pendentes.length === 0 && <p className="text-sm text-ink/50">Nenhum pedido pendente.</p>}
        <div className="space-y-3">
          {pendentes.map((ag) => (
            <div key={ag.id} className="card flex justify-between items-center">
              <div>
                <p className="font-medium">{ag.cliente.nome} — {ag.servico.nome}</p>
                <p className="text-sm text-ink/60">
                  {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" disabled={respondendoId === ag.id} onClick={() => responder(ag.id, "CONFIRMADO")}>
                  {respondendoId === ag.id ? "..." : "Aceitar"}
                </button>
                <button className="btn-secondary" disabled={respondendoId === ag.id} onClick={() => responder(ag.id, "RECUSADO")}>
                  {respondendoId === ag.id ? "..." : "Recusar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {pedidosCancelamento.length > 0 && (
        <section>
          <h2 className="font-medium mb-3">Pedidos de cancelamento</h2>
          <div className="space-y-3">
            {pedidosCancelamento.map((ag) => (
              <div key={ag.id} className="card border-amber-300">
                <p className="font-medium">{ag.cliente.nome} — {ag.servico.nome}</p>
                <p className="text-sm text-ink/60">
                  {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </p>
                <p className="text-sm text-ink/60 mt-1">
                  Motivo: {ag.motivoCancelamento || "não informado"}
                </p>
                <p className="text-xs text-ink/50 mt-1">
                  Fale com o cliente pra entender o motivo antes de decidir.
                </p>
                <div className="flex gap-2 mt-3">
                  <button className="btn-primary" disabled={respondendoId === ag.id} onClick={() => decidirCancelamento(ag.id, true)}>
                    {respondendoId === ag.id ? "..." : "Confirmar cancelamento"}
                  </button>
                  <button className="btn-secondary" disabled={respondendoId === ag.id} onClick={() => decidirCancelamento(ag.id, false)}>
                    {respondendoId === ag.id ? "..." : "Manter agendamento"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-medium mb-3">Minha disponibilidade</h2>
        <div className="space-y-2 mb-4">
          {disponibilidades.map((d) => (
            <div key={d.id} className="card flex justify-between items-center">
              <span>{DIAS[d.diaDaSemana]}: {d.horaInicio} às {d.horaFim}</span>
              <button className="text-sm text-red-600" onClick={() => removerDisponibilidade(d.id)}>Remover</button>
            </div>
          ))}
        </div>
        <form onSubmit={adicionarDisponibilidade} className="card flex flex-wrap gap-2 items-end">
          <select className="input" value={novoDia} onChange={(e) => setNovoDia(Number(e.target.value))}>
            {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <input type="time" step={1800} className="input" value={novaHoraIni} onChange={(e) => setNovaHoraIni(e.target.value)} />
          <input type="time" step={1800} className="input" value={novaHoraFim} onChange={(e) => setNovaHoraFim(e.target.value)} />
          <button className="btn-primary" disabled={salvandoDisponibilidade}>
            {salvandoDisponibilidade ? "Adicionando..." : "Adicionar"}
          </button>
        </form>
        {/* Mensagem repetida aqui (além do topo da página) — sem isso, um
            erro como "Você já tem esse horário cadastrado nesse dia" aparecia
            só lá em cima, longe dessa seção, e passava despercebido. */}
        {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
        {sucesso && <p className="text-sm text-green-600 mt-2">{sucesso}</p>}
      </section>

      <section>
        <h2 className="font-medium mb-3">Meus cortes</h2>
        <p className="text-sm text-ink/50 mb-3">
          Cortes que você cadastra aqui ficam só pra você — os outros barbeiros não oferecem.
        </p>
        <div className="space-y-2 mb-4">
          {servicos
            .filter((s) => s.barbeiros.length === 0 || s.barbeiros.some((b) => b.barbeiroId === meuId))
            .map((s) => (
              <div key={s.id} className="card flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {s.imagemUrl && (
                    <Image src={s.imagemUrl} alt={s.nome} width={40} height={40} className="h-10 w-10 rounded-md object-cover" />
                  )}
                  <span>{s.nome} <span className="text-ink/50 text-sm">({s.duracaoMinutos} min)</span></span>
                </div>
                <span className="font-medium">R$ {Number(s.precoBase).toFixed(2)}</span>
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
            {salvandoServico ? "Cadastrando..." : "Cadastrar corte"}
          </button>
        </form>
        {/* Mesma repetição da mensagem de cima — evita "não está funcionando"
            quando na verdade o erro (ex: preço/duração inválidos) apareceu,
            só que lá no topo da página. */}
        {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
        {sucesso && <p className="text-sm text-green-600 mt-2">{sucesso}</p>}
      </section>

      {ehChefe && (
        <section>
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-medium">Minha equipe</h2>
            <Link href="/barbeiro/desempenho" className="btn-secondary text-sm">
              Desempenho da equipe
            </Link>
          </div>

          <div className="card mb-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium">Faturamento da equipe</h3>
              <select className="input w-32" value={equipePeriodo} onChange={(e) => setEquipePeriodo(e.target.value as any)}>
                <option value="dia">Hoje</option>
                <option value="mes">Este mês</option>
                <option value="ano">Este ano</option>
              </select>
            </div>
            {equipeFinanceiro && (
              <>
                <p className="text-2xl mb-1">R$ {equipeFinanceiro.totalGeral.toFixed(2)}</p>
                <p className="text-sm text-ink/60 mb-4">{equipeFinanceiro.totalDeAtendimentos} atendimentos concluídos</p>
                <div className="space-y-2">
                  {equipeFinanceiro.porBarbeiro.map((b) => (
                    <div key={b.barbeiroId} className="flex justify-between text-sm border-t border-line pt-2">
                      <span>{b.nome} <span className="text-ink/50">({b.quantidade} atendimentos)</span></span>
                      <span className="font-medium">R$ {b.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="mb-4">
            <h3 className="font-medium mb-2">Agendamentos de hoje (toda a equipe)</h3>
            {equipeAgendaHoje.length === 0 && <p className="text-sm text-ink/50">Nada marcado pra hoje.</p>}
            <div className="space-y-2">
              {equipeAgendaHoje.map((ag) => (
                <div key={ag.id} className="card flex justify-between items-center">
                  <div>
                    <p className="font-medium">{ag.cliente.nome} — {ag.servico.nome}</p>
                    <p className="text-sm text-ink/60">
                      {ag.barbeiro?.nome ?? "—"}
                      {" · "}
                      {new Date(ag.data).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      <span className={COR_STATUS[ag.status] || ""}>{ROTULO_STATUS[ag.status] || ag.status}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <h3 className="font-medium mb-2">Barbeiros contratados</h3>
            <p className="text-xs text-ink/50 mb-2">Clique num barbeiro pra ver os agendamentos dele que ainda não aconteceram.</p>
            {equipeBarbeiros.filter((b) => !b.ehChefe).length === 0 && (
              <p className="text-sm text-ink/50 mb-2">Nenhum barbeiro contratado ainda.</p>
            )}
            <div className="space-y-2">
              {equipeBarbeiros.filter((b) => !b.ehChefe).map((b) => (
                <div key={b.id}>
                  <button
                    onClick={() => verAgendaDoBarbeiro(b)}
                    className={`card w-full flex justify-between text-left ${barbeiroSelecionado?.id === b.id ? "border-accent" : ""}`}
                  >
                    <span>{b.nome}</span>
                    <span className="text-sm text-ink/50">{b.email}</span>
                  </button>
                  {barbeiroSelecionado?.id === b.id && (
                    <div className="card mt-1 space-y-2">
                      {carregandoSelecionado ? (
                        <p className="text-sm text-ink/50">Carregando...</p>
                      ) : agendaSelecionado.length === 0 ? (
                        <p className="text-sm text-ink/50">{b.nome} não tem agendamento pendente ou confirmado.</p>
                      ) : (
                        agendaSelecionado.map((ag) => (
                          <div key={ag.id} className="flex justify-between items-center border-t border-line pt-2 first:border-t-0 first:pt-0">
                            <div>
                              <p className="font-medium text-sm">{ag.cliente.nome} — {ag.servico.nome}</p>
                              <p className="text-xs text-ink/60">{formatarDataCurta(ag.data)} · {formatarHora(ag.data)}</p>
                            </div>
                            <span className={`text-xs ${COR_STATUS[ag.status] || ""}`}>{ROTULO_STATUS[ag.status] || ag.status}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={contratarBarbeiro} className="card grid gap-2">
            <input className="input" placeholder="Nome do barbeiro" value={novoContratadoNome} onChange={(e) => setNovoContratadoNome(e.target.value)} required />
            <input className="input" type="email" placeholder="E-mail" value={novoContratadoEmail} onChange={(e) => setNovoContratadoEmail(e.target.value)} required />
            <p className="text-xs text-ink/50">
              Ele(a) recebe um e-mail pra confirmar e criar a própria senha.
            </p>
            <button className="btn-primary" disabled={salvandoContratado}>
              {salvandoContratado ? "Enviando convite..." : "Enviar convite"}
            </button>
          </form>
        </section>
      )}
      </main>
    </>
  );
}
