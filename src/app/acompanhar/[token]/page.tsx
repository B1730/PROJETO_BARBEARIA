"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: "Aguardando confirmação",
  CONFIRMADO: "Confirmado",
  RECUSADO: "Recusado",
  CANCELADO: "Cancelado",
  CONCLUIDO: "Concluído",
};
const COR_STATUS: Record<string, string> = {
  PENDENTE: "text-amber-700",
  CONFIRMADO: "text-green-700",
  RECUSADO: "text-red-600",
  CANCELADO: "text-ink/60",
  CONCLUIDO: "text-ink/60",
};

type Agendamento = {
  id: string;
  status: string;
  data: string;
  precoCobrado: string;
  barbeiro: { nome: string };
  servicos: { nomeServico: string }[];
  cancelamentoSolicitadoEm: string | null;
  motivoCancelamento: string | null;
};

// Tela de quem agendou SEM criar conta (regra de negócio 15) — o token na
// URL é a própria "sessão" (prova posse só desse agendamento, sem login).
// Mesmo padrão visual de /meus-agendamentos, mas buscando por token em vez
// de sessão.
export default function AcompanharAgendamento() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [agendamento, setAgendamento] = useState<Agendamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState("");
  const [pedindoCancelamento, setPedindoCancelamento] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    setErroCarregamento("");
    try {
      const resp = await fetch(`/api/agendamentos/convidado?token=${encodeURIComponent(token)}`);
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErroCarregamento(dados.erro || "Não foi possível carregar esse agendamento.");
        setCarregando(false);
        return;
      }
      setAgendamento(dados.agendamento);
      setCarregando(false);
    } catch {
      setErroCarregamento("Não foi possível conectar. Tente recarregar a página.");
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [token]);

  async function confirmarCancelamento() {
    setErro("");
    setEnviando(true);
    try {
      const resp = await fetch(`/api/agendamentos/${agendamento!.id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo, token }),
      });
      if (!resp.ok) {
        const dados = await resp.json().catch(() => ({}));
        setEnviando(false);
        setErro(dados.erro || "Não foi possível pedir o cancelamento");
        return;
      }
      setEnviando(false);
      setPedindoCancelamento(false);
      carregar();
    } catch {
      setEnviando(false);
      setErro("Não foi possível conectar. Tente novamente.");
    }
  }

  if (carregando) return <main className="max-w-sm mx-auto px-6 py-14 text-ink/60">Carregando...</main>;

  if (erroCarregamento || !agendamento) {
    return (
      <main className="max-w-sm mx-auto px-6 py-14">
        <p className="text-sm text-red-600">{erroCarregamento || "Agendamento não encontrado."}</p>
      </main>
    );
  }

  const nomesCortes = agendamento.servicos.map((s) => s.nomeServico).join(" + ");
  const podeCancelar = ["PENDENTE", "CONFIRMADO"].includes(agendamento.status) && !agendamento.cancelamentoSolicitadoEm;

  return (
    <main className="max-w-sm mx-auto px-6 py-14">
      <h1 className="font-display text-2xl mb-6">Seu agendamento</h1>

      <div className="card">
        <p className="font-medium">{nomesCortes} com {agendamento.barbeiro.nome}</p>
        <p className="text-sm text-ink/60">
          {new Date(agendamento.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          {" · "}R$ {Number(agendamento.precoCobrado).toFixed(2)}
        </p>
        <p className={`text-sm mt-1 ${COR_STATUS[agendamento.status] || ""}`}>{ROTULO_STATUS[agendamento.status] || agendamento.status}</p>

        {agendamento.cancelamentoSolicitadoEm && (
          <p className="text-sm text-amber-600 mt-2">
            Pedido de cancelamento enviado — aguardando o barbeiro entrar em contato.
          </p>
        )}

        {podeCancelar && !pedindoCancelamento && (
          <button className="btn-secondary mt-3" onClick={() => { setErro(""); setMotivo(""); setPedindoCancelamento(true); }}>
            Cancelar agendamento
          </button>
        )}

        {podeCancelar && pedindoCancelamento && (
          <div className="mt-3 space-y-2">
            <label className="block text-sm text-ink/70">
              {agendamento.status === "PENDENTE"
                ? "Motivo (opcional) — o barbeiro ainda não confirmou, então isso cancela na hora"
                : "Motivo (opcional) — ajuda o barbeiro a entender antes de decidir"}
            </label>
            <textarea
              className="input w-full"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
            />
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <div className="flex gap-2">
              <button className="btn-primary" disabled={enviando} onClick={confirmarCancelamento}>
                {enviando ? "Enviando..." : agendamento.status === "PENDENTE" ? "Cancelar agendamento" : "Confirmar pedido de cancelamento"}
              </button>
              <button className="btn-secondary" disabled={enviando} onClick={() => setPedindoCancelamento(false)}>
                Voltar
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
