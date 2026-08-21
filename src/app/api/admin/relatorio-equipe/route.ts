import { NextRequest, NextResponse } from "next/server";
import { exigirAcessoAdmin } from "@/lib/exigirSessao";
import { buscarRelatorioEquipe, calcularJanelaRelatorio } from "@/lib/relatorios";

// GET /api/admin/relatorio-equipe?barbeariaId=...&de=...&ate=...
// Mesmo cálculo de GET /api/relatorio-equipe (regra de negócio 14) —
// sempre a equipe inteira, ADMIN nunca escolhe um barbeiro só.
export async function GET(req: NextRequest) {
  const acesso = await exigirAcessoAdmin(req);
  if (acesso instanceof NextResponse) return acesso;
  const { barbeariaId } = acesso;

  const deParam = req.nextUrl.searchParams.get("de");
  const ateParam = req.nextUrl.searchParams.get("ate");
  if ((deParam && !/^\d{4}-\d{2}-\d{2}$/.test(deParam)) || (ateParam && !/^\d{4}-\d{2}-\d{2}$/.test(ateParam))) {
    return NextResponse.json({ erro: "Data inválida" }, { status: 400 });
  }

  const janela = calcularJanelaRelatorio(deParam, ateParam);
  if (!janela) {
    return NextResponse.json({ erro: "O período final precisa ser depois do inicial" }, { status: 400 });
  }

  const porBarbeiro = await buscarRelatorioEquipe(barbeariaId, janela.inicio, janela.fim);

  return NextResponse.json({ de: janela.inicio, ate: janela.fim, porBarbeiro });
}
