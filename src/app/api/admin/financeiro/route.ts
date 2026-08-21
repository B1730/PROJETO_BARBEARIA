import { NextRequest, NextResponse } from "next/server";
import { exigirAcessoAdmin } from "@/lib/exigirSessao";
import { buscarFinanceiro, calcularJanelaFinanceiro } from "@/lib/relatorios";

// GET /api/admin/financeiro?barbeariaId=...&periodo=mes
// Mesmo cálculo de GET /api/financeiro (regra de negócio 14) — sempre a
// barbearia inteira, nunca filtrado por um barbeiro só.
export async function GET(req: NextRequest) {
  const acesso = await exigirAcessoAdmin(req);
  if (acesso instanceof NextResponse) return acesso;
  const { barbeariaId } = acesso;

  const periodo = req.nextUrl.searchParams.get("periodo") || "mes";
  const { inicio, fim } = calcularJanelaFinanceiro(periodo);
  const resultado = await buscarFinanceiro(barbeariaId, inicio, fim);

  return NextResponse.json({ periodo, desde: inicio, ...resultado });
}
