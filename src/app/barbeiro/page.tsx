"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

type Agendamento = {
  id: string; status: string; data: string;
  cliente: { nome: string }; servico: { nome: string }; precoCobrado: string;
};
type Disponibilidade = { id: string; diaDaSemana: number; horaInicio: string; horaFim: string };
type Servico = {
  id: string; nome: string; precoBase: string; duracaoMinutos: number;
  barbeiros: { barbeiroId: string; preco: string }[];
};

export default function PainelBarbeiro() {
  const router = useRouter();
  const [pendentes, setPendentes] = useState<Agendamento[]>([]);
  const [agendaHoje, setAgendaHoje] = useState<Agendamento[]>([]);
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
  const [salvandoServico, setSalvandoServico] = useState(false);
  const [respondendoId, setRespondendoId] = useState<string | null>(null);
  const [meuId, setMeuId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/sessao").then((r) => r.ok && r.json()).then((d) => d && setMeuId(d.usuario.id));
  }, []);

  async function carregarTudo(mostrarSpinner = true) {
    if (mostrarSpinner) setCarregando(true);
    const [pendResp, hojeResp, dispResp, finResp, servResp] = await Promise.all([
      fetch("/api/agendamentos?status=PENDENTE"),
      fetch(`/api/agendamentos?data=${hojeBrasil()}`),
      fetch("/api/disponibilidade"),
      fetch("/api/financeiro?periodo=mes"),
      fetch("/api/servicos"),
    ]);

    const semAcesso = [pendResp, hojeResp, dispResp, finResp, servResp].some((r) => r.status === 401 || r.status === 403);
    if (semAcesso) {
      router.push("/entrar");
      return;
    }
    if (!pendResp.ok || !hojeResp.ok || !dispResp.ok || !finResp.ok || !servResp.ok) {
      if (mostrarSpinner) {
        setErro("Não foi possível carregar os dados do painel.");
        setCarregando(false);
      }
      return;
    }

    const [pend, hoje, disp, fin, serv] = await Promise.all([
      pendResp.json(), hojeResp.json(), dispResp.json(), finResp.json(), servResp.json(),
    ]);
    setPendentes(pend.agendamentos || []);
    setAgendaHoje(hoje.agendamentos || []);
    setDisponibilidades(disp.disponibilidades || []);
    setFinanceiro(fin);
    setServicos(serv.servicos || []);
    if (mostrarSpinner) setCarregando(false);
  }

  useEffect(() => { carregarTudo(true); }, []);

  useEffect(() => {
    // Faz o pedido do cliente aparecer sozinho na agenda, sem precisar de reload.
    const intervalo = setInterval(() => carregarTudo(false), INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, []);

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
    carregarTudo(false);
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
    carregarTudo(false);
  }

  async function removerDisponibilidade(id: string) {
    setErro("");
    const resp = await fetch(`/api/disponibilidade/${id}`, { method: "DELETE" });
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível remover essa disponibilidade");
      return;
    }
    carregarTudo(false);
  }

  async function adicionarServico(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setSalvandoServico(true);
    const resp = await fetch("/api/servicos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: novoServicoNome,
        precoBase: Number(novoServicoPreco),
        duracaoMinutos: Number(novoServicoDuracao),
      }),
    });
    setSalvandoServico(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível cadastrar esse corte");
      return;
    }
    setNovoServicoNome(""); setNovoServicoPreco(""); setNovoServicoDuracao("30");
    setSucesso("Corte cadastrado — só aparece pra você agendar.");
    carregarTudo(false);
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
          <p className="text-sm text-ink/60">{financeiro.totalDeAtendimentos} atendimentos concluídos</p>
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
          <input type="time" className="input" value={novaHoraIni} onChange={(e) => setNovaHoraIni(e.target.value)} />
          <input type="time" className="input" value={novaHoraFim} onChange={(e) => setNovaHoraFim(e.target.value)} />
          <button className="btn-primary" disabled={salvandoDisponibilidade}>
            {salvandoDisponibilidade ? "Adicionando..." : "Adicionar"}
          </button>
        </form>
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
              <div key={s.id} className="card flex justify-between">
                <span>{s.nome} <span className="text-ink/50 text-sm">({s.duracaoMinutos} min)</span></span>
                <span className="font-medium">R$ {Number(s.precoBase).toFixed(2)}</span>
              </div>
            ))}
        </div>
        <form onSubmit={adicionarServico} className="card grid gap-2">
          <input className="input" placeholder="Nome do corte" value={novoServicoNome} onChange={(e) => setNovoServicoNome(e.target.value)} required />
          <input className="input" type="number" step="0.01" placeholder="Preço (R$)" value={novoServicoPreco} onChange={(e) => setNovoServicoPreco(e.target.value)} required />
          <input className="input" type="number" placeholder="Duração (minutos)" value={novoServicoDuracao} onChange={(e) => setNovoServicoDuracao(e.target.value)} required />
          <button className="btn-primary" disabled={salvandoServico}>
            {salvandoServico ? "Cadastrando..." : "Cadastrar corte"}
          </button>
        </form>
      </section>
      </main>
    </>
  );
}
