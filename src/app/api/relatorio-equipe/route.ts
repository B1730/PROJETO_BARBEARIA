import { NextRequest, NextResponse } from "next/server";
import { exigirSessao, sessaoTemPrivilegioDeChefe } from "@/lib/exigirSessao";
import { buscarRelatorioEquipe, calcularJanelaRelatorio } from "@/lib/relatorios";

// GET /api/relatorio-equipe?de=2026-08-01&ate=2026-08-31
// Chefe/dono (ver sessaoTemPrivilegioDeChefe) vê a barbearia inteira,
// barbeiro por barbeiro. Um BARBEIRO comum (ou DONO sem privilégio de
// chefe — não deveria existir na prática, mas por segurança) também pode
// chamar isso, só que sempre restrito aos PRÓPRIOS números — nunca escolhe
// outro colega nem vê a barbearia inteira, mesma rota, só o `porBarbeiro`
// abaixo fica com uma linha só. Período é um intervalo livre de datas (não
// um enum fixo tipo dia/mês/ano do /api/financeiro) — cobre "um dia",
// "várias semanas", "vários meses" ou "um ano inteiro" com a mesma lógica,
// sem precisar de um caminho de código pra cada granularidade. Sem
// ?de/?ate, cai no mês corrente (mesmo padrão do período "mes" de
// /api/financeiro).
export async function GET(req: NextRequest) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;
  const ehChefeOuDono = await sessaoTemPrivilegioDeChefe(sessao);

  const deParam = req.nextUrl.searchParams.get("de");
  const ateParam = req.nextUrl.searchParams.get("ate");
  if ((deParam && !/^\d{4}-\d{2}-\d{2}$/.test(deParam)) || (ateParam && !/^\d{4}-\d{2}-\d{2}$/.test(ateParam))) {
    return NextResponse.json({ erro: "Data inválida" }, { status: 400 });
  }

  const janela = calcularJanelaRelatorio(deParam, ateParam);
  if (!janela) {
    return NextResponse.json({ erro: "O período final precisa ser depois do inicial" }, { status: 400 });
  }

  const barbeariaId = sessao.barbeariaId!;
  const porBarbeiro = await buscarRelatorioEquipe(
    barbeariaId,
    janela.inicio,
    janela.fim,
    ehChefeOuDono ? undefined : sessao.usuarioId
  );

  return NextResponse.json({ de: janela.inicio, ate: janela.fim, ehChefeOuDono, porBarbeiro });
}
