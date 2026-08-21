"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";

type Barbearia = { id: string; nome: string; slug: string };
type Barbeiro = { id: string; nome: string; email: string; ehChefe: boolean };
type Servico = {
  id: string; nome: string; precoBase: string; duracaoMinutos: number; aprovado: boolean;
  barbeiros: { barbeiroId: string; barbeiro: { nome: string } }[];
};
type Financeiro = { totalGeral: number; totalDeAtendimentos: number; porBarbeiro: { barbeiroId: string; nome: string; total: number; quantidade: number }[] };
type Agendamento = {
  id: string; status: string; data: string;
  cliente: { nome: string };
  barbeiro: { nome: string };
  servicos: { nomeServico: string }[];
};

const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: "Aguardando confirmação", CONFIRMADO: "Confirmado", RECUSADO: "Recusado",
  CANCELADO: "Cancelado", CONCLUIDO: "Concluído",
};

// Visão somente-leitura de UMA barbearia, pro ADMIN com acesso ativo a
// ela (regra de negócio 14) — nenhum botão aqui muda nada, é só consulta.
// Cada requisição já é validada de novo no backend (GET /api/admin/*):
// mesmo se o acesso expirar/for revogado enquanto essa aba está aberta, a
// próxima ação (trocar o período do faturamento, por exemplo) recebe 403.
export default function VisualizarBarbeariaAdmin() {
  const params = useParams<{ barbeariaId: string }>();
  const router = useRouter();
  const barbeariaId = params.barbeariaId;

  const [barbearia, setBarbearia] = useState<Barbearia | null>(null);
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [financeiro, setFinanceiro] = useState<Financeiro | null>(null);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [periodo, setPeriodo] = useState<"dia" | "mes" | "ano">("mes");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function carregarBase() {
    setErro("");
    const qs = `?barbeariaId=${barbeariaId}`;
    const [bResp, bsResp, ssResp, agResp] = await Promise.all([
      fetch("/api/admin/barbearias"),
      fetch(`/api/admin/barbeiros${qs}`),
      fetch(`/api/admin/servicos${qs}`),
      fetch(`/api/admin/agendamentos${qs}`),
    ]);
    if (bResp.status === 401 || bsResp.status === 401) { router.push("/entrar"); return; }
    if (bsResp.status === 403 || ssResp.status === 403 || agResp.status === 403) {
      setErro("Sem acesso a essa barbearia (expirado, revogado, ou nunca concedido).");
      setCarregando(false);
      return;
    }
    if (bResp.ok) {
      const b = await bResp.json();
      const alvo = (b.acessos || []).find((a: any) => a.barbearia.id === barbeariaId);
      setBarbearia(alvo?.barbearia || null);
    }
    if (bsResp.ok) setBarbeiros((await bsResp.json()).barbeiros || []);
    if (ssResp.ok) setServicos((await ssResp.json()).servicos || []);
    if (agResp.ok) setAgendamentos((await agResp.json()).agendamentos || []);
    setCarregando(false);
  }

  async function carregarFinanceiro(periodoAtual: string) {
    const resp = await fetch(`/api/admin/financeiro?barbeariaId=${barbeariaId}&periodo=${periodoAtual}`);
    if (resp.ok) setFinanceiro(await resp.json());
  }

  useEffect(() => { carregarBase(); }, [barbeariaId]);
  useEffect(() => { carregarFinanceiro(periodo); }, [barbeariaId, periodo]);

  if (carregando) {
    return (
      <>
        <Cabecalho />
        <main className="max-w-2xl mx-auto px-6 py-14 text-ink/60">Carregando...</main>
      </>
    );
  }

  return (
    <>
      <Cabecalho />
      <main className="max-w-2xl mx-auto px-6 py-14 space-y-10">
        <div>
          <Link href="/plataforma" className="text-sm text-ink/60 hover:text-ink">← Barbearias</Link>
          <h1 className="font-display text-3xl mt-2">{barbearia?.nome || "Barbearia"}</h1>
          <p className="text-xs text-ink/50 mt-1">Visualização somente leitura — nada aqui pode ser alterado.</p>
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        {!erro && (
          <>
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
              <div className="space-y-2">
                {barbeiros.map((b) => (
                  <div key={b.id} className="card">
                    <span>{b.nome}</span>
                    {b.ehChefe && <span className="ml-2 text-xs text-accent">★ Chefe</span>}
                    <span className="block text-sm text-ink/50">{b.email}</span>
                  </div>
                ))}
                {barbeiros.length === 0 && <p className="text-sm text-ink/50">Nenhum barbeiro cadastrado.</p>}
              </div>
            </section>

            <section>
              <h2 className="font-medium mb-3">Cortes e preços</h2>
              <div className="space-y-2">
                {servicos.map((s) => (
                  <div key={s.id} className="card">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{s.nome}</span>
                      <span>R$ {Number(s.precoBase).toFixed(2)}</span>
                    </div>
                    <p className="text-sm text-ink/50">
                      {s.duracaoMinutos} min
                      {!s.aprovado && <span className="ml-2 text-amber-700">Pendente de aprovação</span>}
                    </p>
                    <p className="text-xs text-ink/50 mt-1">
                      {s.barbeiros.length === 0
                        ? "Nenhum barbeiro vinculado ainda"
                        : `Atende: ${s.barbeiros.map((b) => b.barbeiro.nome).join(", ")}`}
                    </p>
                  </div>
                ))}
                {servicos.length === 0 && <p className="text-sm text-ink/50">Nenhum corte cadastrado.</p>}
              </div>
            </section>

            <section>
              <h2 className="font-medium mb-3">Agendamentos recentes</h2>
              <div className="space-y-2">
                {agendamentos.slice(0, 20).map((ag) => (
                  <div key={ag.id} className="card">
                    <p className="font-medium">{ag.cliente.nome} com {ag.barbeiro.nome}</p>
                    <p className="text-sm text-ink/60">
                      {ag.servicos.map((s) => s.nomeServico).join(" + ")}
                      {" · "}
                      {new Date(ag.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </p>
                    <p className="text-sm text-ink/60">{ROTULO_STATUS[ag.status] || ag.status}</p>
                  </div>
                ))}
                {agendamentos.length === 0 && <p className="text-sm text-ink/50">Nenhum agendamento ainda.</p>}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
