import { NextRequest, NextResponse } from "next/server";
import { exigirSessao, sessaoTemPrivilegioDeChefe } from "@/lib/exigirSessao";
import { buscarFinanceiro, calcularJanelaFinanceiro } from "@/lib/relatorios";

// GET /api/financeiro?periodo=mes
// periodo: "dia" | "mes" | "ano" (padrão: mes)
// DONO vê o faturamento da barbearia inteira, agrupado por barbeiro.
// BARBEIRO vê só o próprio faturamento — a não ser que seja o barbeiro
// chefe da barbearia E passe ?equipe=1, aí vê o mesmo agrupado que o dono
// vê. Sem esse parâmetro o chefe também só vê o próprio (usado pro
// cartão pessoal dele no painel).
export async function GET(req: NextRequest) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const periodo = req.nextUrl.searchParams.get("periodo") || "mes";
  const { inicio, fim } = calcularJanelaFinanceiro(periodo);

  const equipe = req.nextUrl.searchParams.get("equipe") === "1";
  let apenasBarbeiroId: string | undefined;
  if (sessao.papel === "BARBEIRO") {
    apenasBarbeiroId = sessao.usuarioId;
    if (equipe && (await sessaoTemPrivilegioDeChefe(sessao))) apenasBarbeiroId = undefined;
  }

  const resultado = await buscarFinanceiro(sessao.barbeariaId!, inicio, fim, apenasBarbeiroId);

  return NextResponse.json({ periodo, desde: inicio, ...resultado });
}
