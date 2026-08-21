"use client";

import { useState } from "react";
import Image from "next/image";

export type Servico = {
  id: string;
  nome: string;
  precoBase: string;
  duracaoMinutos: number;
  imagemUrl: string | null;
  aprovado: boolean;
  barbeiros: { barbeiroId: string }[];
};
type BarbeiroElegivel = { id: string; nome: string };

type Props = {
  servicos: Servico[];
  barbeirosElegiveis: BarbeiroElegivel[];
  recarregar: () => void;
  onErro: (msg: string) => void;
  onSucesso: (msg: string) => void;
};

// Compartilhado entre admin/page.tsx ("Cortes e preços") e a seção "Minha
// equipe" de barbeiro/page.tsx (só pro barbeiro-chefe) — as duas telas
// gerenciam os mesmos cortes da barbearia inteira, com o mesmo privilégio
// (ver sessaoTemPrivilegioDeChefe), então extrair evita as duas divergirem
// com o tempo (mesmo motivo de PainelDisponibilidade). Cada corte agora
// precisa de vínculo explícito com quem atende (regra de negócio 5
// revisada) — sem vínculo nenhum, o corte existe mas não aparece pra
// ninguém ainda. Uma solicitação pendente de um contratado (aprovado:false)
// aparece destacada, com um botão "Aprovar".
export default function PainelCortes({ servicos, barbeirosElegiveis, recarregar, onErro, onSucesso }: Props) {
  const [novoNome, setNovoNome] = useState("");
  const [novoPreco, setNovoPreco] = useState("");
  const [novaDuracao, setNovaDuracao] = useState("30");
  const [novaImagem, setNovaImagem] = useState<File | null>(null);
  const [novosBarbeiros, setNovosBarbeiros] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editPreco, setEditPreco] = useState("");
  const [editDuracao, setEditDuracao] = useState("30");
  const [editImagem, setEditImagem] = useState<File | null>(null);
  const [editBarbeiros, setEditBarbeiros] = useState<Set<string>>(new Set());
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [aprovandoId, setAprovandoId] = useState<string | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  async function enviarImagem(arquivo: File): Promise<string> {
    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("pasta", "cortes");
    const resp = await fetch("/api/upload", { method: "POST", body: form });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Não foi possível enviar a imagem");
    return dados.url as string;
  }

  function nomesDosBarbeiros(s: Servico) {
    if (s.barbeiros.length === 0) return "Nenhum barbeiro vinculado ainda";
    return s.barbeiros
      .map((b) => barbeirosElegiveis.find((be) => be.id === b.barbeiroId)?.nome || "—")
      .join(", ");
  }

  function alternarNovoBarbeiro(id: string) {
    setNovosBarbeiros((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }
  function alternarEditBarbeiro(id: string) {
    setEditBarbeiros((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    onErro("");
    onSucesso("");
    setSalvando(true);

    let imagemUrl: string | undefined;
    if (novaImagem) {
      try {
        imagemUrl = await enviarImagem(novaImagem);
      } catch (erro: any) {
        setSalvando(false);
        onErro(erro.message || "Não foi possível enviar a imagem");
        return;
      }
    }

    const resp = await fetch("/api/servicos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: novoNome,
        precoBase: Number(novoPreco),
        duracaoMinutos: Number(novaDuracao),
        imagemUrl,
        barbeiroIds: [...novosBarbeiros],
      }),
    });
    setSalvando(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      onErro(dados.erro || "Não foi possível cadastrar esse corte");
      return;
    }
    setNovoNome("");
    setNovoPreco("");
    setNovaDuracao("30");
    setNovaImagem(null);
    setNovosBarbeiros(new Set());
    onSucesso("Corte cadastrado.");
    recarregar();
  }

  function iniciarEdicao(s: Servico) {
    onErro("");
    onSucesso("");
    setEditandoId(s.id);
    setEditNome(s.nome);
    setEditPreco(String(s.precoBase));
    setEditDuracao(String(s.duracaoMinutos));
    setEditImagem(null);
    setEditBarbeiros(new Set(s.barbeiros.map((b) => b.barbeiroId)));
  }
  function cancelarEdicao() {
    onErro("");
    onSucesso("");
    setEditandoId(null);
  }

  async function salvarEdicao(id: string) {
    onErro("");
    onSucesso("");
    setSalvandoEdicao(true);

    let imagemUrl: string | undefined;
    if (editImagem) {
      try {
        imagemUrl = await enviarImagem(editImagem);
      } catch (erro: any) {
        setSalvandoEdicao(false);
        onErro(erro.message || "Não foi possível enviar a imagem");
        return;
      }
    }

    const resp = await fetch(`/api/servicos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: editNome,
        precoBase: Number(editPreco),
        duracaoMinutos: Number(editDuracao),
        ...(imagemUrl ? { imagemUrl } : {}),
        barbeiroIds: [...editBarbeiros],
      }),
    });
    setSalvandoEdicao(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      onErro(dados.erro || "Não foi possível salvar esse corte");
      return;
    }
    setEditandoId(null);
    onSucesso("Corte atualizado.");
    recarregar();
  }

  async function aprovar(id: string) {
    onErro("");
    onSucesso("");
    setAprovandoId(id);
    const resp = await fetch(`/api/servicos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aprovado: true }),
    });
    setAprovandoId(null);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      onErro(dados.erro || "Não foi possível aprovar esse corte");
      return;
    }
    onSucesso("Corte aprovado — já aparece pro cliente escolher.");
    recarregar();
  }

  async function remover(id: string) {
    if (!window.confirm("Excluir esse corte? Isso pode afetar agendamentos futuros que já usam ele.")) return;
    onErro("");
    onSucesso("");
    setRemovendoId(id);
    const resp = await fetch(`/api/servicos/${id}`, { method: "DELETE" });
    setRemovendoId(null);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      onErro(dados.erro || "Não foi possível excluir esse corte");
      return;
    }
    recarregar();
  }

  const pendentes = servicos.filter((s) => !s.aprovado);
  const aprovados = servicos.filter((s) => s.aprovado);

  return (
    <div>
      {pendentes.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-sm font-medium text-amber-700">Solicitações de corte pendentes</p>
          {pendentes.map((s) => (
            <div key={s.id} className="card border-amber-300 flex justify-between items-center">
              <div>
                <p className="font-medium">{s.nome} <span className="text-ink/50 text-sm">({s.duracaoMinutos} min)</span></p>
                <p className="text-sm text-ink/60">R$ {Number(s.precoBase).toFixed(2)} · pedido por {nomesDosBarbeiros(s)}</p>
              </div>
              <button
                className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={aprovandoId === s.id}
                onClick={() => aprovar(s.id)}
              >
                {aprovandoId === s.id ? "Aprovando..." : "Aprovar"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 mb-4">
        {aprovados.map((s) => (
          <div key={s.id} className="card">
            {editandoId === s.id ? (
              <div className="grid gap-2">
                <input className="input" placeholder="Nome do corte" value={editNome} onChange={(e) => setEditNome(e.target.value)} />
                <input className="input" type="number" step="0.01" placeholder="Preço (R$)" value={editPreco} onChange={(e) => setEditPreco(e.target.value)} />
                <input className="input" type="number" placeholder="Duração (minutos)" value={editDuracao} onChange={(e) => setEditDuracao(e.target.value)} />
                <div>
                  <label className="text-sm text-ink/60 mb-1 block">Trocar foto (opcional)</label>
                  <input className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setEditImagem(e.target.files?.[0] || null)} />
                </div>
                <div>
                  <label className="text-sm text-ink/60 mb-1 block">Quem atende esse corte</label>
                  <div className="flex flex-wrap gap-3">
                    {barbeirosElegiveis.map((b) => (
                      <label key={b.id} className="flex items-center gap-1 text-sm">
                        <input type="checkbox" checked={editBarbeiros.has(b.id)} onChange={() => alternarEditBarbeiro(b.id)} />
                        {b.nome}
                      </label>
                    ))}
                    {barbeirosElegiveis.length === 0 && <p className="text-xs text-ink/50">Nenhum barbeiro contratado ainda.</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary" disabled={salvandoEdicao} onClick={() => salvarEdicao(s.id)}>
                    {salvandoEdicao ? "Salvando..." : "Salvar"}
                  </button>
                  <button className="btn-secondary" disabled={salvandoEdicao} onClick={cancelarEdicao}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {s.imagemUrl && (
                    <Image src={s.imagemUrl} alt={s.nome} width={40} height={40} className="h-10 w-10 rounded-md object-cover shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate">{s.nome} <span className="text-ink/50 text-sm">({s.duracaoMinutos} min)</span></p>
                    <p className="text-xs text-ink/50 truncate">{nomesDosBarbeiros(s)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-medium">R$ {Number(s.precoBase).toFixed(2)}</span>
                  <button className="text-sm text-ink/60 hover:text-ink" onClick={() => iniciarEdicao(s)}>Editar</button>
                  <button
                    className="text-sm text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={removendoId === s.id}
                    onClick={() => remover(s.id)}
                  >
                    {removendoId === s.id ? "Excluindo..." : "Excluir"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={adicionar} className="card grid gap-2">
        <input className="input" placeholder="Nome do corte" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} required />
        <input className="input" type="number" step="0.01" placeholder="Preço (R$)" value={novoPreco} onChange={(e) => setNovoPreco(e.target.value)} required />
        <input className="input" type="number" placeholder="Duração (minutos)" value={novaDuracao} onChange={(e) => setNovaDuracao(e.target.value)} required />
        <div>
          <label className="text-sm text-ink/60 mb-1 block">Foto do corte (opcional)</label>
          <input className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setNovaImagem(e.target.files?.[0] || null)} />
        </div>
        <div>
          <label className="text-sm text-ink/60 mb-1 block">Quem atende esse corte (opcional — dá pra vincular depois)</label>
          <div className="flex flex-wrap gap-3">
            {barbeirosElegiveis.map((b) => (
              <label key={b.id} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={novosBarbeiros.has(b.id)} onChange={() => alternarNovoBarbeiro(b.id)} />
                {b.nome}
              </label>
            ))}
            {barbeirosElegiveis.length === 0 && <p className="text-xs text-ink/50">Nenhum barbeiro contratado ainda.</p>}
          </div>
        </div>
        <button className="btn-primary" disabled={salvando}>
          {salvando ? "Adicionando..." : "Adicionar corte"}
        </button>
      </form>
    </div>
  );
}
