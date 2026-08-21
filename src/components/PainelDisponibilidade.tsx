"use client";

import { useState } from "react";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export type Disponibilidade = { id: string; diaDaSemana: number; horaInicio: string; horaFim: string };

type Props = {
  disponibilidades: Disponibilidade[];
  recarregar: () => void;
  onErro: (msg: string) => void;
  onSucesso: (msg: string) => void;
};

// Compartilhado entre barbeiro/page.tsx e admin/page.tsx (seção "Eu também
// atendo") — as duas telas editam exatamente a mesma entidade (Disponibilidade
// do próprio usuário logado, seja BARBEIRO ou DONO atendendo), então extrair
// isso evita as duas versões divergirem de novo com o tempo. erro/sucesso
// continuam sendo estado do componente pai (via onErro/onSucesso) pra manter
// o padrão já existente de repetir a mensagem perto de cada seção da página.
export default function PainelDisponibilidade({ disponibilidades, recarregar, onErro, onSucesso }: Props) {
  const [novoDia, setNovoDia] = useState(1);
  const [novaHoraIni, setNovaHoraIni] = useState("09:00");
  const [novaHoraFim, setNovaHoraFim] = useState("18:00");
  const [salvandoDisponibilidade, setSalvandoDisponibilidade] = useState(false);
  const [editandoDisponibilidadeId, setEditandoDisponibilidadeId] = useState<string | null>(null);
  const [editHoraIni, setEditHoraIni] = useState("09:00");
  const [editHoraFim, setEditHoraFim] = useState("18:00");
  const [salvandoEdicaoDisponibilidade, setSalvandoEdicaoDisponibilidade] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [diaReplicando, setDiaReplicando] = useState<number | null>(null);
  const [diasDestinoReplicar, setDiasDestinoReplicar] = useState<Set<number>>(new Set());
  const [salvandoReplicar, setSalvandoReplicar] = useState(false);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    onErro("");
    onSucesso("");
    setSalvandoDisponibilidade(true);
    const resp = await fetch("/api/disponibilidade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diaDaSemana: novoDia, horaInicio: novaHoraIni, horaFim: novaHoraFim }),
    });
    setSalvandoDisponibilidade(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      onErro(dados.erro || "Não foi possível adicionar essa disponibilidade");
      return;
    }
    recarregar();
  }

  async function remover(id: string) {
    if (!window.confirm("Remover essa disponibilidade?")) return;
    onErro("");
    onSucesso("");
    setRemovendoId(id);
    const resp = await fetch(`/api/disponibilidade/${id}`, { method: "DELETE" });
    setRemovendoId(null);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      onErro(dados.erro || "Não foi possível remover essa disponibilidade");
      return;
    }
    recarregar();
  }

  function iniciarEdicao(d: Disponibilidade) {
    onErro("");
    onSucesso("");
    setEditandoDisponibilidadeId(d.id);
    setEditHoraIni(d.horaInicio);
    setEditHoraFim(d.horaFim);
  }

  function cancelarEdicao() {
    onErro("");
    onSucesso("");
    setEditandoDisponibilidadeId(null);
  }

  async function salvarEdicao(id: string, diaDaSemana: number) {
    onErro("");
    onSucesso("");
    setSalvandoEdicaoDisponibilidade(true);
    const resp = await fetch(`/api/disponibilidade/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diaDaSemana, horaInicio: editHoraIni, horaFim: editHoraFim }),
    });
    setSalvandoEdicaoDisponibilidade(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      onErro(dados.erro || "Não foi possível salvar essa edição");
      return;
    }
    setEditandoDisponibilidadeId(null);
    recarregar();
  }

  function abrirReplicar(dia: number) {
    onErro("");
    onSucesso("");
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

  async function replicar(diaOrigem: number) {
    onErro("");
    onSucesso("");
    setSalvandoReplicar(true);
    const resp = await fetch("/api/disponibilidade/replicar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diaOrigem, diasDestino: [...diasDestinoReplicar] }),
    });
    setSalvandoReplicar(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      onErro(dados.erro || "Não foi possível replicar essa disponibilidade");
      return;
    }
    const dados = await resp.json();
    onSucesso(
      dados.criadas > 0
        ? `${dados.criadas} janela(s) adicionada(s).`
        : "Os dias escolhidos já tinham essas janelas — nada novo pra adicionar."
    );
    setDiaReplicando(null);
    recarregar();
  }

  const dias = [...new Set(disponibilidades.map((d) => d.diaDaSemana))].sort((a, b) => a - b);

  return (
    <div>
      <div className="space-y-4 mb-4">
        {dias.length === 0 && <p className="text-sm text-ink/50">Nenhuma disponibilidade cadastrada ainda.</p>}
        {dias.map((dia) => (
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
                      <button className="btn-primary" disabled={salvandoEdicaoDisponibilidade} onClick={() => salvarEdicao(d.id, dia)}>
                        {salvandoEdicaoDisponibilidade ? "Salvando..." : "Salvar"}
                      </button>
                      <button className="btn-secondary" disabled={salvandoEdicaoDisponibilidade} onClick={cancelarEdicao}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span>{d.horaInicio} às {d.horaFim}</span>
                      <div className="flex gap-3 shrink-0">
                        <button className="text-sm text-ink/60 hover:text-ink" onClick={() => iniciarEdicao(d)}>Editar</button>
                        <button
                          className="text-sm text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={removendoId === d.id}
                          onClick={() => remover(d.id)}
                        >
                          {removendoId === d.id ? "Removendo..." : "Remover"}
                        </button>
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
                  onClick={() => replicar(dia)}
                >
                  {salvandoReplicar ? "Replicando..." : "Replicar"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={adicionar} className="card flex flex-wrap gap-2 items-end">
        <select className="input" value={novoDia} onChange={(e) => setNovoDia(Number(e.target.value))}>
          {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
        <input type="time" step={1800} className="input" value={novaHoraIni} onChange={(e) => setNovaHoraIni(e.target.value)} />
        <input type="time" step={1800} className="input" value={novaHoraFim} onChange={(e) => setNovaHoraFim(e.target.value)} />
        <button className="btn-primary" disabled={salvandoDisponibilidade}>
          {salvandoDisponibilidade ? "Adicionando..." : "Adicionar"}
        </button>
      </form>
    </div>
  );
}
