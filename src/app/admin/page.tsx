"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Cabecalho from "@/components/Cabecalho";

type Barbeiro = { id: string; nome: string; email: string };
type Servico = { id: string; nome: string; precoBase: string; duracaoMinutos: number };
type Financeiro = { totalGeral: number; totalDeAtendimentos: number; porBarbeiro: { barbeiroId: string; nome: string; total: number; quantidade: number }[] };

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
  const [novoBarbeiroSenha, setNovoBarbeiroSenha] = useState("");
  const [salvandoBarbeiro, setSalvandoBarbeiro] = useState(false);

  const [novoServicoNome, setNovoServicoNome] = useState("");
  const [novoServicoPreco, setNovoServicoPreco] = useState("");
  const [novoServicoDuracao, setNovoServicoDuracao] = useState("30");
  const [salvandoServico, setSalvandoServico] = useState(false);

  async function carregarTudo(mostrarSpinner = true) {
    if (mostrarSpinner) setCarregando(true);
    const [bResp, sResp, fResp] = await Promise.all([
      fetch("/api/barbeiros"),
      fetch("/api/servicos"),
      fetch(`/api/financeiro?periodo=${periodo}`),
    ]);

    const semAcesso = [bResp, sResp, fResp].some((r) => r.status === 401 || r.status === 403);
    if (semAcesso) {
      router.push("/entrar");
      return;
    }
    if (!bResp.ok || !sResp.ok || !fResp.ok) {
      if (mostrarSpinner) {
        setErro("Não foi possível carregar os dados do painel.");
        setCarregando(false);
      }
      return;
    }

    const [b, s, f] = await Promise.all([bResp.json(), sResp.json(), fResp.json()]);
    setBarbeiros(b.barbeiros || []);
    setServicos(s.servicos || []);
    setFinanceiro(f);
    if (mostrarSpinner) setCarregando(false);
  }

  useEffect(() => { carregarTudo(); }, [periodo]);

  async function adicionarBarbeiro(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setSalvandoBarbeiro(true);
    const resp = await fetch("/api/barbeiros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novoBarbeiroNome, email: novoBarbeiroEmail, senhaInicial: novoBarbeiroSenha }),
    });
    setSalvandoBarbeiro(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível adicionar esse barbeiro");
      return;
    }
    setNovoBarbeiroNome(""); setNovoBarbeiroEmail(""); setNovoBarbeiroSenha("");
    setSucesso("Barbeiro adicionado.");
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
      setErro(dados.erro || "Não foi possível adicionar esse corte");
      return;
    }
    setNovoServicoNome(""); setNovoServicoPreco(""); setNovoServicoDuracao("30");
    setSucesso("Corte cadastrado.");
    carregarTudo(false);
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
            <div key={b.id} className="card flex justify-between">
              <span>{b.nome}</span>
              <span className="text-sm text-ink/50">{b.email}</span>
            </div>
          ))}
        </div>
        <form onSubmit={adicionarBarbeiro} className="card grid gap-2">
          <input className="input" placeholder="Nome do barbeiro" value={novoBarbeiroNome} onChange={(e) => setNovoBarbeiroNome(e.target.value)} required />
          <input className="input" type="email" placeholder="E-mail" value={novoBarbeiroEmail} onChange={(e) => setNovoBarbeiroEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Senha inicial (ele troca depois)" value={novoBarbeiroSenha} onChange={(e) => setNovoBarbeiroSenha(e.target.value)} required minLength={6} />
          <button className="btn-primary" disabled={salvandoBarbeiro}>
            {salvandoBarbeiro ? "Adicionando..." : "Adicionar barbeiro"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-medium mb-3">Cortes e preços</h2>
        <div className="space-y-2 mb-4">
          {servicos.map((s) => (
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
            {salvandoServico ? "Adicionando..." : "Adicionar corte"}
          </button>
        </form>
      </section>
      </main>
    </>
  );
}
