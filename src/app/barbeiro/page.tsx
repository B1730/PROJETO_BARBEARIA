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
function formatarDataCurta(dataIso: string) {
  return new Date(dataIso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}
function formatarHora(dataIso: string) {
  return new Date(dataIso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

type Agendamento = {
  id: string; status: string; data: string;
  cliente: { nome: string; email: string; whatsapp: string | null };
  servicos: { nomeServico: string }[];
  precoCobrado: string;
  barbeiro?: { id: string; nome: string };
  cancelamentoSolicitadoEm: string | null; motivoCancelamento: string | null;
  ocultoPeloBarbeiro: boolean;
};
type Disponibilidade = { id: string; diaDaSemana: number; horaInicio: string; horaFim: string };
type Servico = {
  id: string; nome: string; precoBase: string; duracaoMinutos: number; imagemUrl: string | null;
  barbeiros: { barbeiroId: string; preco: string }[];
};

function nomesCortes(ag: Agendamento) {
  return ag.servicos.map((s) => s.nomeServico).join(" + ");
}

// Clicar num agendamento mostra os dados de contato do cliente (nome,
// e-mail, WhatsApp) — fica escondido por padrão pra não poluir os
// cartões, cada um abre/fecha por conta própria.
function DetalheCliente({ ag, aberto, onToggle }: { ag: Agendamento; aberto: boolean; onToggle: () => void }) {
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
type BarbeiroEquipe = { id: string; nome: string; email: string; ehChefe: boolean };
type Financeiro = { totalGeral: number; totalDeAtendimentos: number; porBarbeiro: { barbeiroId: string; nome: string; total: number; quantidade: number }[] };

export default function PainelBarbeiro() {
  const router = useRouter();
  const [pendentes, setPendentes] = useState<Agendamento[]>([]);
  const [pedidosCancelamento, setPedidosCancelamento] = useState<Agendamento[]>([]);
  const [agendaHoje, setAgendaHoje] = useState<Agendamento[]>([]);
  const [cortesAgendados, setCortesAgendados] = useState<Agendamento[]>([]);
  const [cortesConcluidos, setCortesConcluidos] = useState<Agendamento[]>([]);
  const [cortesCancelados, setCortesCancelados] = useState<Agendamento[]>([]);
  const [mostrandoOcultos, setMostrandoOcultos] = useState(false);
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
  const [editandoDisponibilidadeId, setEditandoDisponibilidadeId] = useState<string | null>(null);
  const [editHoraIni, setEditHoraIni] = useState("09:00");
  const [editHoraFim, setEditHoraFim] = useState("18:00");
  const [salvandoEdicaoDisponibilidade, setSalvandoEdicaoDisponibilidade] = useState(false);
  const [diaReplicando, setDiaReplicando] = useState<number | null>(null);
  const [diasDestinoReplicar, setDiasDestinoReplicar] = useState<Set<number>>(new Set());
  const [salvandoReplicar, setSalvandoReplicar] = useState(false);
  const [novoServicoNome, setNovoServicoNome] = useState("");
  const [novoServicoPreco, setNovoServicoPreco] = useState("");
  const [novoServicoDuracao, setNovoServicoDuracao] = useState("30");
  const [novoServicoImagem, setNovoServicoImagem] = useState<File | null>(null);
  const [salvandoServico, setSalvandoServico] = useState(false);
  const [editandoServicoId, setEditandoServicoId] = useState<string | null>(null);
  const [editServicoNome, setEditServicoNome] = useState("");
  const [editServicoPreco, setEditServicoPreco] = useState("");
  const [editServicoDuracao, setEditServicoDuracao] = useState("30");
  const [editServicoImagem, setEditServicoImagem] = useState<File | null>(null);
  const [salvandoEdicaoServico, setSalvandoEdicaoServico] = useState(false);
  const [respondendoId, setRespondendoId] = useState<string | null>(null);
  const [detalhesExpandidos, setDetalhesExpandidos] = useState<Set<string>>(new Set());
  function alternarDetalhe(id: string) {
    setDetalhesExpandidos((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }
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
  // useCallback com mostrandoOcultos na dependência — mesmo motivo do
  // carregarEquipe logo abaixo: sem isso, a referência usada no polling
  // (setInterval) ficava congelada no valor de quando o efeito rodou a
  // primeira vez (sempre false), e o toggle "Mostrar ocultos" parava de
  // funcionar depois do primeiro poll de 8s.
  const carregarAgendamentos = useCallback(async (mostrarSpinner = true) => {
    if (mostrarSpinner) setCarregando(true);
    const sufixoOcultos = mostrandoOcultos ? "&mostrarOcultos=1" : "";
    const [pendResp, hojeResp, confResp, concResp, cancResp] = await Promise.all([
      fetch("/api/agendamentos?status=PENDENTE"),
      fetch(`/api/agendamentos?data=${hojeBrasil()}`),
      fetch("/api/agendamentos?status=CONFIRMADO"),
      fetch(`/api/agendamentos?status=CONCLUIDO${sufixoOcultos}`),
      fetch(`/api/agendamentos?status=CANCELADO${sufixoOcultos}`),
    ]);

    const respostas = [pendResp, hojeResp, confResp, concResp, cancResp];
    const semAcesso = respostas.some((r) => r.status === 401 || r.status === 403);
    if (semAcesso) {
      router.push("/entrar");
      return;
    }
    if (respostas.some((r) => !r.ok)) {
      if (mostrarSpinner) {
        setErro("Não foi possível carregar os dados do painel.");
        setCarregando(false);
      }
      return;
    }

    const [pend, hoje, conf, conc, canc] = await Promise.all(respostas.map((r) => r.json()));
    const pendentesLista: Agendamento[] = pend.agendamentos || [];
    setPendentes(pendentesLista);
    setAgendaHoje(hoje.agendamentos || []);

    // "Cortes agendados" — só CONFIRMADO, tudo (hoje e datas futuras),
    // separado dos pedidos ainda pendentes de aceite.
    const confirmadosLista: Agendamento[] = conf.agendamentos || [];
    setCortesAgendados([...confirmadosLista].sort((a, b) => a.data.localeCompare(b.data)));

    // "Cortes concluídos" e "Cortes cancelados" (com motivo) — histórico,
    // mais recentes primeiro; limitado a 20 pra não crescer sem fim na tela.
    setCortesConcluidos(
      [...(conc.agendamentos || [])].sort((a: Agendamento, b: Agendamento) => b.data.localeCompare(a.data)).slice(0, 20)
    );
    setCortesCancelados(
      [...(canc.agendamentos || [])].sort((a: Agendamento, b: Agendamento) => b.data.localeCompare(a.data)).slice(0, 20)
    );

    // Pedidos de cancelamento do cliente ficam em aberto em qualquer
    // agendamento PENDENTE ou CONFIRMADO (ver POST /api/agendamentos/[id]/cancelar) —
    // não é um status à parte, é uma marca em cima do que já existe.
    setPedidosCancelamento(
      [...pendentesLista, ...confirmadosLista]
        .filter((ag) => ag.cancelamentoSolicitadoEm)
        .sort((a, b) => a.data.localeCompare(b.data))
    );

    if (mostrarSpinner) setCarregando(false);
  }, [mostrandoOcultos]);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- só na primeira carga; o toggle "mostrar ocultos" tem o próprio efeito abaixo.
  useEffect(() => { carregarAgendamentos(true); carregarDadosEstaveis(); }, []);

  // Refaz a busca (sem o spinner de página inteira) quando o toggle "Mostrar
  // ocultos" muda — dispara também na primeira carga, mas como o valor
  // inicial é sempre false isso só repete o que a linha acima já buscou,
  // sem custo perceptível.
  useEffect(() => { carregarAgendamentos(false); }, [mostrandoOcultos, carregarAgendamentos]);

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
  }, [ehChefe, carregarEquipe, carregarAgendamentos]);

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

  // Marca um corte confirmado como concluído — pode ser antes do horário
  // marcado, ou em outro dia qualquer (decisão do usuário: o cliente pode
  // ter ido atender em outro momento combinado informalmente). O horário
  // original volta a ficar livre pra outro cliente (CONCLUIDO não conta
  // como ocupado em calcularHorariosLivres).
  async function concluir(id: string) {
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
    carregarAgendamentos(false);
  }

  // Some com um corte concluído/cancelado da própria visão (sem apagar do
  // banco) — ou desfaz isso quando "Mostrar ocultos" está ligado.
  async function ocultar(id: string, valor: boolean) {
    setErro("");
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

  function iniciarEdicaoDisponibilidade(d: Disponibilidade) {
    setErro("");
    setEditandoDisponibilidadeId(d.id);
    setEditHoraIni(d.horaInicio);
    setEditHoraFim(d.horaFim);
  }

  function cancelarEdicaoDisponibilidade() {
    setEditandoDisponibilidadeId(null);
  }

  async function salvarEdicaoDisponibilidade(id: string, diaDaSemana: number) {
    setErro("");
    setSalvandoEdicaoDisponibilidade(true);
    const resp = await fetch(`/api/disponibilidade/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diaDaSemana, horaInicio: editHoraIni, horaFim: editHoraFim }),
    });
    setSalvandoEdicaoDisponibilidade(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível salvar essa edição");
      return;
    }
    setEditandoDisponibilidadeId(null);
    carregarDadosEstaveis();
  }

  function abrirReplicar(dia: number) {
    setErro("");
    setSucesso("");
    setDiaReplicando(diaReplicando === dia ? null : dia);
    setDiasDestinoReplicar(new Set());
  }

  function alternarDiaDestino(dia: number) {
    setDiasDestinoReplicar((prev) => {
      const novo = new Set(prev);
      if (novo.has(dia)) novo.delete(dia);
      else novo.add(dia);
      return novo;
    });
  }

  async function replicarDisponibilidade(diaOrigem: number) {
    setErro("");
    setSucesso("");
    setSalvandoReplicar(true);
    const resp = await fetch("/api/disponibilidade/replicar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diaOrigem, diasDestino: [...diasDestinoReplicar] }),
    });
    setSalvandoReplicar(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível replicar essa disponibilidade");
      return;
    }
    const dados = await resp.json();
    setSucesso(
      dados.criadas > 0
        ? `${dados.criadas} janela(s) adicionada(s).`
        : "Os dias escolhidos já tinham essas janelas — nada novo pra adicionar."
    );
    setDiaReplicando(null);
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

  async function removerServico(id: string) {
    setErro("");
    const resp = await fetch(`/api/servicos/${id}`, { method: "DELETE" });
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível excluir esse corte");
      return;
    }
    carregarDadosEstaveis();
  }

  function iniciarEdicaoServico(s: Servico) {
    setErro("");
    setSucesso("");
    setEditandoServicoId(s.id);
    setEditServicoNome(s.nome);
    setEditServicoPreco(String(s.precoBase));
    setEditServicoDuracao(String(s.duracaoMinutos));
    setEditServicoImagem(null);
  }

  function cancelarEdicaoServico() {
    setEditandoServicoId(null);
  }

  async function salvarEdicaoServico(id: string) {
    setErro("");
    setSucesso("");
    setSalvandoEdicaoServico(true);

    let imagemUrl: string | undefined;
    if (editServicoImagem) {
      try {
        imagemUrl = await enviarImagem(editServicoImagem, "cortes");
      } catch (erro: any) {
        setSalvandoEdicaoServico(false);
        setErro(erro.message || "Não foi possível enviar a imagem");
        return;
      }
    }

    const resp = await fetch(`/api/servicos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: editServicoNome,
        precoBase: Number(editServicoPreco),
        duracaoMinutos: Number(editServicoDuracao),
        ...(imagemUrl ? { imagemUrl } : {}),
      }),
    });
    setSalvandoEdicaoServico(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível salvar esse corte");
      return;
    }
    setEditandoServicoId(null);
    setSucesso("Corte atualizado.");
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
      <div className="flex justify-between items-center">
        <h1 className="font-display text-3xl">Painel do barbeiro</h1>
        <Link href="/barbeiro/desempenho" className="btn-secondary text-sm shrink-0">
          Visualizar dados da barbearia
        </Link>
      </div>
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
                <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                <p className="text-sm text-ink/60">
                  {new Date(ag.data).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  <span className={COR_STATUS[ag.status] || ""}>{ROTULO_STATUS[ag.status] || ag.status}</span>
                </p>
                <DetalheCliente ag={ag} aberto={detalhesExpandidos.has(ag.id)} onToggle={() => alternarDetalhe(ag.id)} />
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
        <h2 className="font-medium mb-3">Cortes agendados</h2>
        <p className="text-xs text-ink/50 mb-3">Confirmados, aguardando o dia do atendimento.</p>
        {cortesAgendados.length === 0 ? (
          <p className="text-sm text-ink/50">Nada confirmado no momento.</p>
        ) : (
          <div className="space-y-3">
            {cortesAgendados.map((ag) => (
              <div key={ag.id} className="card flex justify-between items-center">
                <div>
                  <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                  <p className="text-sm text-ink/60">
                    {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    {" · "}R$ {Number(ag.precoCobrado).toFixed(2)}
                  </p>
                  <DetalheCliente ag={ag} aberto={detalhesExpandidos.has(ag.id)} onToggle={() => alternarDetalhe(ag.id)} />
                </div>
                <button className="btn-secondary" disabled={respondendoId === ag.id} onClick={() => concluir(ag.id)}>
                  {respondendoId === ag.id ? "..." : "Marcar concluído"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-sm text-ink/60">
          <input
            type="checkbox"
            checked={mostrandoOcultos}
            onChange={(e) => setMostrandoOcultos(e.target.checked)}
          />
          Mostrar ocultos
        </label>
      </div>

      <section>
        <h2 className="font-medium mb-3">Cortes concluídos</h2>
        {cortesConcluidos.length === 0 ? (
          <p className="text-sm text-ink/50">Nenhum corte concluído ainda.</p>
        ) : (
          <div className="space-y-3">
            {cortesConcluidos.map((ag) => (
              <div key={ag.id} className={`card flex justify-between items-start ${ag.ocultoPeloBarbeiro ? "opacity-50" : ""}`}>
                <div>
                  <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                  <p className="text-sm text-ink/60">
                    {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    {" · "}R$ {Number(ag.precoCobrado).toFixed(2)}
                  </p>
                </div>
                <button
                  className="text-sm text-ink/40 hover:text-ink shrink-0"
                  disabled={respondendoId === ag.id}
                  onClick={() => ocultar(ag.id, !ag.ocultoPeloBarbeiro)}
                  title={ag.ocultoPeloBarbeiro ? "Desocultar" : "Ocultar da minha visão"}
                >
                  {respondendoId === ag.id ? "..." : ag.ocultoPeloBarbeiro ? "Desocultar" : "✕"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-3">Cortes cancelados</h2>
        {cortesCancelados.length === 0 ? (
          <p className="text-sm text-ink/50">Nenhum corte cancelado.</p>
        ) : (
          <div className="space-y-3">
            {cortesCancelados.map((ag) => (
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
                  onClick={() => ocultar(ag.id, !ag.ocultoPeloBarbeiro)}
                  title={ag.ocultoPeloBarbeiro ? "Desocultar" : "Ocultar da minha visão"}
                >
                  {respondendoId === ag.id ? "..." : ag.ocultoPeloBarbeiro ? "Desocultar" : "✕"}
                </button>
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
                <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                <p className="text-sm text-ink/60">
                  {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </p>
                <DetalheCliente ag={ag} aberto={detalhesExpandidos.has(ag.id)} onToggle={() => alternarDetalhe(ag.id)} />
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
                <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
                <p className="text-sm text-ink/60">
                  {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </p>
                <p className="text-sm text-ink/60 mt-1">
                  Motivo: {ag.motivoCancelamento || "não informado"}
                </p>
                <p className="text-xs text-ink/50 mt-1">
                  Fale com o cliente pra entender o motivo antes de decidir.
                </p>
                <DetalheCliente ag={ag} aberto={detalhesExpandidos.has(ag.id)} onToggle={() => alternarDetalhe(ag.id)} />
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
        <div className="space-y-4 mb-4">
          {[...new Set(disponibilidades.map((d) => d.diaDaSemana))].sort((a, b) => a - b).length === 0 && (
            <p className="text-sm text-ink/50">Nenhuma disponibilidade cadastrada ainda.</p>
          )}
          {[...new Set(disponibilidades.map((d) => d.diaDaSemana))].sort((a, b) => a - b).map((dia) => (
            <div key={dia}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-ink/70">{DIAS[dia]}</span>
                <button className="text-xs underline text-ink/50" onClick={() => abrirReplicar(dia)}>
                  {diaReplicando === dia ? "Cancelar" : "Replicar pra outros dias"}
                </button>
              </div>
              <div className="space-y-2">
                {disponibilidades.filter((d) => d.diaDaSemana === dia).map((d) => (
                  <div key={d.id} className="card">
                    {editandoDisponibilidadeId === d.id ? (
                      <div className="flex flex-wrap gap-2 items-end">
                        <input type="time" step={1800} className="input" value={editHoraIni} onChange={(e) => setEditHoraIni(e.target.value)} />
                        <input type="time" step={1800} className="input" value={editHoraFim} onChange={(e) => setEditHoraFim(e.target.value)} />
                        <button className="btn-primary" disabled={salvandoEdicaoDisponibilidade} onClick={() => salvarEdicaoDisponibilidade(d.id, dia)}>
                          {salvandoEdicaoDisponibilidade ? "Salvando..." : "Salvar"}
                        </button>
                        <button className="btn-secondary" disabled={salvandoEdicaoDisponibilidade} onClick={cancelarEdicaoDisponibilidade}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <span>{d.horaInicio} às {d.horaFim}</span>
                        <div className="flex gap-3">
                          <button className="text-sm text-ink/60 hover:text-ink" onClick={() => iniciarEdicaoDisponibilidade(d)}>Editar</button>
                          <button className="text-sm text-red-600" onClick={() => removerDisponibilidade(d.id)}>Remover</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {diaReplicando === dia && (
                <div className="card mt-2 space-y-2">
                  <p className="text-xs text-ink/60">Copiar as janelas de {DIAS[dia]} pra quais dias?</p>
                  <div className="flex flex-wrap gap-3">
                    {DIAS.map((nomeDia, i) => i !== dia && (
                      <label key={i} className="flex items-center gap-1 text-sm">
                        <input type="checkbox" checked={diasDestinoReplicar.has(i)} onChange={() => alternarDiaDestino(i)} />
                        {nomeDia}
                      </label>
                    ))}
                  </div>
                  <button
                    className="btn-primary text-sm"
                    disabled={salvandoReplicar || diasDestinoReplicar.size === 0}
                    onClick={() => replicarDisponibilidade(dia)}
                  >
                    {salvandoReplicar ? "Replicando..." : "Replicar"}
                  </button>
                </div>
              )}
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
            .map((s) => {
              const ehMeuExclusivo = s.barbeiros.length === 1 && s.barbeiros[0].barbeiroId === meuId;
              return (
                <div key={s.id} className="card">
                  {editandoServicoId === s.id ? (
                    <div className="grid gap-2">
                      <input className="input" placeholder="Nome do corte" value={editServicoNome} onChange={(e) => setEditServicoNome(e.target.value)} />
                      <input className="input" type="number" step="0.01" placeholder="Preço (R$)" value={editServicoPreco} onChange={(e) => setEditServicoPreco(e.target.value)} />
                      <input className="input" type="number" placeholder="Duração (minutos)" value={editServicoDuracao} onChange={(e) => setEditServicoDuracao(e.target.value)} />
                      <div>
                        <label className="text-sm text-ink/60 mb-1 block">Trocar foto (opcional)</label>
                        <input
                          className="input"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => setEditServicoImagem(e.target.files?.[0] || null)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button className="btn-primary" disabled={salvandoEdicaoServico} onClick={() => salvarEdicaoServico(s.id)}>
                          {salvandoEdicaoServico ? "Salvando..." : "Salvar"}
                        </button>
                        <button className="btn-secondary" disabled={salvandoEdicaoServico} onClick={cancelarEdicaoServico}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        {s.imagemUrl && (
                          <Image src={s.imagemUrl} alt={s.nome} width={40} height={40} className="h-10 w-10 rounded-md object-cover" />
                        )}
                        <span>{s.nome} <span className="text-ink/50 text-sm">({s.duracaoMinutos} min)</span></span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">R$ {Number(s.precoBase).toFixed(2)}</span>
                        {ehMeuExclusivo && (
                          <>
                            <button className="text-sm text-ink/60 hover:text-ink" onClick={() => iniciarEdicaoServico(s)}>Editar</button>
                            <button className="text-sm text-red-600" onClick={() => removerServico(s.id)}>Excluir</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
          <h2 className="font-medium mb-3">Minha equipe</h2>

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
                    <p className="font-medium">{ag.cliente.nome} — {nomesCortes(ag)}</p>
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
                              <p className="font-medium text-sm">{ag.cliente.nome} — {nomesCortes(ag)}</p>
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
