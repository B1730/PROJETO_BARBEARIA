"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";

type LinhaBarbeiro = {
  barbeiroId: string;
  nome: string;
  faturamentoBruto: number;
  cortesConcluidos: number;
  corteMaisFeito: { nome: string; quantidade: number } | null;
  cortesCancelados: number;
  tempoMedioParaAceitarMinutos: number | null;
  pedidosAceitosNoPeriodo: number;
};

function formatarData(d: Date) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarDuracao(minutos: number | null) {
  if (minutos === null) return "—";
  const totalMin = Math.round(minutos);
  if (totalMin < 60) return `${totalMin} min`;
  const horas = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (horas < 24) return `${horas}h${min > 0 ? ` ${min}min` : ""}`;
  const dias = Math.floor(horas / 24);
  const horasRestantes = horas % 24;
  return `${dias}d${horasRestantes > 0 ? ` ${horasRestantes}h` : ""}`;
}

export default function DesempenhoEquipe() {
  const router = useRouter();
  const hoje = new Date();
  const [de, setDe] = useState(formatarData(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [ate, setAte] = useState(formatarData(hoje));
  const [linhas, setLinhas] = useState<LinhaBarbeiro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [semPermissao, setSemPermissao] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");
    const resp = await fetch(`/api/relatorio-equipe?de=${de}&ate=${ate}`);
    setCarregando(false);
    if (resp.status === 401) {
      router.push("/entrar");
      return;
    }
    if (resp.status === 403) {
      setSemPermissao(true);
      return;
    }
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível carregar o relatório");
      return;
    }
    const dados = await resp.json();
    setLinhas(dados.porBarbeiro || []);
  }

  useEffect(() => { carregar(); }, []);

  function aplicarPreset(preset: "hoje" | "semana" | "mes" | "ano") {
    const agora = new Date();
    let inicio: Date;
    let fim: Date;
    if (preset === "hoje") {
      inicio = fim = agora;
    } else if (preset === "semana") {
      inicio = new Date(agora);
      inicio.setDate(agora.getDate() - agora.getDay());
      fim = new Date(inicio);
      fim.setDate(inicio.getDate() + 6);
    } else if (preset === "mes") {
      inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
      fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
    } else {
      inicio = new Date(agora.getFullYear(), 0, 1);
      fim = new Date(agora.getFullYear(), 11, 31);
    }
    setDe(formatarData(inicio));
    setAte(formatarData(fim));
  }

  if (semPermissao) {
    return (
      <>
        <Cabecalho />
        <main className="max-w-2xl mx-auto px-6 py-14">
          <p className="text-ink/70">Essa área é só para o barbeiro chefe.</p>
          <Link href="/barbeiro" className="underline text-sm">← Voltar</Link>
        </main>
      </>
    );
  }

  return (
    <>
      <Cabecalho />
      <main className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/barbeiro" className="text-sm text-ink/60 hover:text-ink">← Voltar</Link>
        <h1 className="font-display text-3xl mt-2 mb-6">Desempenho da equipe</h1>

        <div className="card mb-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-sm" onClick={() => aplicarPreset("hoje")}>Hoje</button>
            <button className="btn-secondary text-sm" onClick={() => aplicarPreset("semana")}>Esta semana</button>
            <button className="btn-secondary text-sm" onClick={() => aplicarPreset("mes")}>Este mês</button>
            <button className="btn-secondary text-sm" onClick={() => aplicarPreset("ano")}>Este ano</button>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-ink/60 block mb-1">De</label>
              <input type="date" className="input" value={de} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-ink/60 block mb-1">Até</label>
              <input type="date" className="input" value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
            <button className="btn-primary" disabled={carregando} onClick={carregar}>
              {carregando ? "Carregando..." : "Filtrar"}
            </button>
          </div>
          <p className="text-xs text-ink/50">
            O período pode ser um dia só, várias semanas, vários meses ou um ano inteiro — é só escolher as datas.
          </p>
        </div>

        {erro && <p className="text-sm text-red-600 mb-4">{erro}</p>}

        {!carregando && linhas.length === 0 && !erro && (
          <p className="text-sm text-ink/50">Nenhum barbeiro encontrado.</p>
        )}

        <div className="space-y-3">
          {linhas.map((l) => (
            <div key={l.barbeiroId} className="card">
              <p className="font-medium mb-3">{l.nome}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-ink/50">Faturamento bruto</p>
                  <p className="font-medium">R$ {l.faturamentoBruto.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-ink/50">Cortes concluídos</p>
                  <p className="font-medium">{l.cortesConcluidos}</p>
                </div>
                <div>
                  <p className="text-ink/50">Corte mais feito</p>
                  <p className="font-medium">
                    {l.corteMaisFeito ? `${l.corteMaisFeito.nome} (${l.corteMaisFeito.quantidade}x)` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-ink/50">Cortes cancelados</p>
                  <p className="font-medium">{l.cortesCancelados}</p>
                </div>
                <div>
                  <p className="text-ink/50">Tempo médio pra aceitar</p>
                  <p className="font-medium">
                    {formatarDuracao(l.tempoMedioParaAceitarMinutos)}
                    {l.pedidosAceitosNoPeriodo > 0 && (
                      <span className="text-ink/40"> ({l.pedidosAceitosNoPeriodo} pedido{l.pedidosAceitosNoPeriodo === 1 ? "" : "s"})</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
