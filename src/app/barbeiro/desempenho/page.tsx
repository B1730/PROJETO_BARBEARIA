"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";

type CorteConcluidoDetalhe = {
  id: string;
  data: string;
  concluidoEm: string | null;
  nomesCortes: string;
  divergente: boolean;
};
type LinhaBarbeiro = {
  barbeiroId: string;
  nome: string;
  faturamentoBruto: number;
  totalAgendamentos: number;
  cortesConcluidos: number;
  corteMaisFeito: { nome: string; quantidade: number } | null;
  cortesCancelados: number;
  tempoMedioParaAceitarMinutos: number | null;
  pedidosAceitosNoPeriodo: number;
  cortesConcluidosDetalhe: CorteConcluidoDetalhe[];
};

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}

// Datas calculadas a partir do fuso de Brasília (não do fuso do navegador
// de quem acessa) — mesmo padrão de src/lib/horarios.ts e de hojeBrasil()
// em barbeiro/page.tsx. A partir daqui, toda conta de data usa Date.UTC +
// getters UTC (um "calendário puro"), nunca o fuso local do navegador.
function hojeBrasilPartes() {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [ano, mes, dia] = hoje.split("-").map(Number);
  return { ano, mes, dia };
}

function formatarData(d: Date) {
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
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
  const { ano: anoHoje, mes: mesHoje, dia: diaHoje } = hojeBrasilPartes();
  const [de, setDe] = useState(formatarData(new Date(Date.UTC(anoHoje, mesHoje - 1, 1))));
  const [ate, setAte] = useState(formatarData(new Date(Date.UTC(anoHoje, mesHoje - 1, diaHoje))));
  const [mostrarIntervaloLivre, setMostrarIntervaloLivre] = useState(false);
  const [linhas, setLinhas] = useState<LinhaBarbeiro[]>([]);
  const [ehChefeOuDono, setEhChefeOuDono] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [semPermissao, setSemPermissao] = useState(false);
  const [erro, setErro] = useState("");

  // Aceita de/ate explícitos (usado pelos atalhos de período, que senão
  // dispararia a busca com o "de"/"ate" ainda velho — setDe/setAte são
  // assíncronos, o valor novo só existiria no próximo render) — sem
  // parâmetro, usa o que já está nos campos (usado pelo botão "Filtrar").
  async function carregar(deParam?: string, ateParam?: string) {
    const deUsado = deParam ?? de;
    const ateUsado = ateParam ?? ate;
    setCarregando(true);
    setErro("");
    const resp = await fetch(`/api/relatorio-equipe?de=${deUsado}&ate=${ateUsado}`);
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
    setEhChefeOuDono(dados.ehChefeOuDono !== false);
  }

  useEffect(() => { carregar(); }, []);

  function aplicarPreset(preset: "hoje" | "semana" | "mes" | "ano") {
    const { ano, mes, dia } = hojeBrasilPartes();
    const agora = new Date(Date.UTC(ano, mes - 1, dia));
    let inicio: Date;
    let fim: Date;
    if (preset === "hoje") {
      inicio = fim = agora;
    } else if (preset === "semana") {
      inicio = new Date(agora);
      inicio.setUTCDate(agora.getUTCDate() - agora.getUTCDay());
      fim = new Date(inicio);
      fim.setUTCDate(inicio.getUTCDate() + 6);
    } else if (preset === "mes") {
      inicio = new Date(Date.UTC(ano, mes - 1, 1));
      fim = new Date(Date.UTC(ano, mes, 0));
    } else {
      inicio = new Date(Date.UTC(ano, 0, 1));
      fim = new Date(Date.UTC(ano, 11, 31));
    }
    const deStr = formatarData(inicio);
    const ateStr = formatarData(fim);
    setDe(deStr);
    setAte(ateStr);
    carregar(deStr, ateStr);
  }

  if (semPermissao) {
    return (
      <>
        <Cabecalho />
        <main className="max-w-2xl mx-auto px-6 py-14">
          <p className="text-ink/70">Você precisa estar logado como barbeiro ou dono pra ver isso.</p>
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
        <h1 className="font-display text-3xl mt-2 mb-1">Visualizar dados da barbearia</h1>
        <p className="text-sm text-ink/50 mb-6">
          {ehChefeOuDono ? "Dados de todos os barbeiros da equipe." : "Seus próprios dados de atendimento."}
        </p>

        <div className="card mb-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-sm" disabled={carregando} onClick={() => aplicarPreset("hoje")}>Hoje</button>
            <button className="btn-secondary text-sm" disabled={carregando} onClick={() => aplicarPreset("semana")}>Esta semana</button>
            <button className="btn-secondary text-sm" disabled={carregando} onClick={() => aplicarPreset("mes")}>Este mês</button>
            <button className="btn-secondary text-sm" disabled={carregando} onClick={() => aplicarPreset("ano")}>Este ano</button>
            {!mostrarIntervaloLivre && (
              <button className="btn-secondary text-sm" onClick={() => setMostrarIntervaloLivre(true)}>
                Adicionar data diferente
              </button>
            )}
          </div>
          {mostrarIntervaloLivre && (
            <>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="text-xs text-ink/60 block mb-1">De</label>
                  <input type="date" className="input" value={de} onChange={(e) => setDe(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-ink/60 block mb-1">Até</label>
                  <input type="date" className="input" value={ate} onChange={(e) => setAte(e.target.value)} />
                </div>
                <button className="btn-primary" disabled={carregando} onClick={() => carregar()}>
                  {carregando ? "Carregando..." : "Filtrar"}
                </button>
              </div>
              <p className="text-xs text-ink/50">
                "De" e "Até" aceitam qualquer intervalo — um dia só, uma semana específica, ou vários meses juntos
                (ex.: escolha o início de janeiro em "De" e o fim de fevereiro em "Até" pra ver os dois meses somados).
              </p>
            </>
          )}
        </div>

        {erro && <p className="text-sm text-red-600 mb-4">{erro}</p>}

        {carregando && linhas.length === 0 && <p className="text-sm text-ink/60">Carregando...</p>}

        {!carregando && linhas.length === 0 && !erro && (
          <p className="text-sm text-ink/50">Nenhum dado encontrado.</p>
        )}

        <div className="space-y-3">
          {linhas.map((l) => (
            <div key={l.barbeiroId} className="card">
              {ehChefeOuDono && <p className="font-medium mb-3">{l.nome}</p>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-ink/50">Total de agendamentos</p>
                  <p className="font-medium">{l.totalAgendamentos}</p>
                </div>
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

              {l.cortesConcluidosDetalhe.length > 0 && (
                <div className="mt-4 pt-3 border-t border-line">
                  <p className="text-xs text-ink/50 mb-2">
                    Cortes concluídos no período — data marcada e data em que foi concluído
                  </p>
                  <div className="space-y-2">
                    {l.cortesConcluidosDetalhe.map((c) => (
                      <div key={c.id} className={`text-xs ${c.divergente ? "text-amber-700" : "text-ink/60"}`}>
                        <p className={`font-medium ${c.divergente ? "" : "text-ink"}`}>{c.nomesCortes}</p>
                        <p>
                          agendado {formatarDataHora(c.data)}
                          {c.concluidoEm && (
                            <>
                              {" · "}concluído {formatarDataHora(c.concluidoEm)}
                              {c.divergente && " ⚠"}
                            </>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
