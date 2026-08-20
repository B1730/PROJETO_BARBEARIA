"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Cabecalho from "@/components/Cabecalho";

type Barbeiro = { id: string; nome: string; email: string; ehChefe: boolean };
type Servico = { id: string; nome: string; precoBase: string; duracaoMinutos: number; imagemUrl: string | null };
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
  const [salvandoBarbeiro, setSalvandoBarbeiro] = useState(false);
  const [alternandoChefeId, setAlternandoChefeId] = useState<string | null>(null);

  const [novoServicoNome, setNovoServicoNome] = useState("");
  const [novoServicoPreco, setNovoServicoPreco] = useState("");
  const [novoServicoDuracao, setNovoServicoDuracao] = useState("30");
  const [novoServicoImagem, setNovoServicoImagem] = useState<File | null>(null);
  const [salvandoServico, setSalvandoServico] = useState(false);

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
            {salvandoServico ? "Adicionando..." : "Adicionar corte"}
          </button>
        </form>
      </section>
      </main>
    </>
  );
}
