"use client";

import { useEffect, useState } from "react";

const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: "Aguardando confirmação",
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

function nomesCortes(ag: Agendamento) {
  return ag.servicos.map((s) => s.nomeServico).join(" + ");
}

export default function MeusAgendamentos() {
  const [sessao, setSessao] = useState<{ papel: string } | null | undefined>(undefined);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [pedindoCancelamentoId, setPedindoCancelamentoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [meuWhatsapp, setMeuWhatsapp] = useState("");
  const [salvandoWhatsapp, setSalvandoWhatsapp] = useState(false);
  const [sucessoWhatsapp, setSucessoWhatsapp] = useState("");

  async function carregar() {
    // As três requisições não dependem uma da outra — GET /api/agendamentos
    // e GET /api/perfil já se limitam aos dados do usuário logado, seja ele
    // qual for; só não usamos o resultado se não for CLIENTE. Rodar em
    // paralelo evita esperar a sessão responder antes de nem começar a
    // buscar o resto.
    const [sResp, aResp, pResp] = await Promise.all([
      fetch("/api/auth/sessao"),
      fetch("/api/agendamentos"),
      fetch("/api/perfil"),
    ]);
    if (!sResp.ok) { setSessao(null); setCarregando(false); return; }
    const s = await sResp.json();
    setSessao(s.usuario);
    if (s.usuario.papel === "CLIENTE") {
      if (aResp.ok) {
        const a = await aResp.json();
        const lista: Agendamento[] = (a.agendamentos || []).sort((x: Agendamento, y: Agendamento) => x.data.localeCompare(y.data));
        setAgendamentos(lista);
      }
      if (pResp.ok) {
        const p = await pResp.json();
        setMeuWhatsapp(p.usuario?.whatsapp || "");
      }
    }
    setCarregando(false);
  }

  useEffect(() => { carregar(); }, []);

  async function salvarMeuWhatsapp(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucessoWhatsapp("");
    setSalvandoWhatsapp(true);
    const resp = await fetch("/api/perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsapp: meuWhatsapp }),
    });
    setSalvandoWhatsapp(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível salvar");
      return;
    }
    setSucessoWhatsapp("Salvo!");
  }

  function abrirPedidoCancelamento(id: string) {
    setErro("");
    setMotivo("");
    setPedindoCancelamentoId(id);
  }

  async function confirmarPedidoCancelamento(id: string) {
    setErro("");
    setEnviando(true);
    const resp = await fetch(`/api/agendamentos/${id}/cancelar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    });
    setEnviando(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível pedir o cancelamento");
      return;
    }
    setPedindoCancelamentoId(null);
    carregar();
  }

  if (carregando) return <main className="max-w-2xl mx-auto px-6 py-14 text-ink/60">Carregando...</main>;

  if (!sessao || sessao.papel !== "CLIENTE") {
    return (
      <main className="max-w-2xl mx-auto px-6 py-14">
        <p className="text-ink/70">
          Você precisa entrar com uma conta de cliente pra ver seus agendamentos.{" "}
          <a className="underline" href="/entrar?next=/meus-agendamentos">Entrar</a>
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-14">
      <h1 className="font-display text-3xl mb-6">Meus agendamentos</h1>

      <div className="card mb-8">
        <h2 className="font-medium mb-1">Meu WhatsApp</h2>
        <p className="text-xs text-ink/50 mb-3">
          Deixe seu número aqui pra o barbeiro poder entrar em contato se precisar.
        </p>
        <form onSubmit={salvarMeuWhatsapp} className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder="Seu WhatsApp (com DDD e país, só números)"
            value={meuWhatsapp}
            onChange={(e) => setMeuWhatsapp(e.target.value)}
          />
          <button className="btn-primary" disabled={salvandoWhatsapp}>
            {salvandoWhatsapp ? "Salvando..." : "Salvar"}
          </button>
        </form>
        {sucessoWhatsapp && <p className="text-sm text-green-600 mt-2">{sucessoWhatsapp}</p>}
      </div>

      {erro && <p className="text-sm text-red-600 mb-4">{erro}</p>}

      {agendamentos.length === 0 && <p className="text-sm text-ink/50">Você ainda não tem nenhum agendamento.</p>}

      <div className="space-y-3">
        {agendamentos.map((ag) => {
          const podeCancelar = ["PENDENTE", "CONFIRMADO"].includes(ag.status) && !ag.cancelamentoSolicitadoEm;
          return (
            <div key={ag.id} className="card">
              <p className="font-medium">{nomesCortes(ag)} com {ag.barbeiro.nome}</p>
              <p className="text-sm text-ink/60">
                {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                {" · "}R$ {Number(ag.precoCobrado).toFixed(2)}
              </p>
              <p className={`text-sm mt-1 ${COR_STATUS[ag.status] || ""}`}>{ROTULO_STATUS[ag.status] || ag.status}</p>

              {ag.cancelamentoSolicitadoEm && (
                <p className="text-sm text-amber-600 mt-2">
                  Pedido de cancelamento enviado — aguardando o barbeiro entrar em contato.
                </p>
              )}

              {podeCancelar && pedindoCancelamentoId !== ag.id && (
                <button className="btn-secondary mt-3" onClick={() => abrirPedidoCancelamento(ag.id)}>
                  Cancelar agendamento
                </button>
              )}

              {podeCancelar && pedindoCancelamentoId === ag.id && (
                <div className="mt-3 space-y-2">
                  <label className="block text-sm text-ink/70">
                    {ag.status === "PENDENTE"
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
                  <div className="flex gap-2">
                    <button className="btn-primary" disabled={enviando} onClick={() => confirmarPedidoCancelamento(ag.id)}>
                      {enviando ? "Enviando..." : ag.status === "PENDENTE" ? "Cancelar agendamento" : "Confirmar pedido de cancelamento"}
                    </button>
                    <button className="btn-secondary" disabled={enviando} onClick={() => setPedindoCancelamentoId(null)}>
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
