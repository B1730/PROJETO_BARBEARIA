import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

// GET: barbearias que o ADMIN logado tem acesso ATIVO agora (não expirado,
// não revogado) — é a tela inicial do painel do ADMIN (regra de negócio 14).
export async function GET() {
  const sessao = await exigirSessao(["ADMIN"]);
  if (sessao instanceof NextResponse) return sessao;

  const acessos = await db.acessoPlataforma.findMany({
    where: { usuarioId: sessao.usuarioId, revogadoEm: null, expiraEm: { gt: new Date() } },
    include: { barbearia: { select: { id: true, nome: true, slug: true } } },
    orderBy: { expiraEm: "asc" },
  });

  return NextResponse.json({
    acessos: acessos.map((a) => ({ barbearia: a.barbearia, expiraEm: a.expiraEm, motivo: a.motivo })),
  });
}
