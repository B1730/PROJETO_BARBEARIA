import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

// PATCH: revoga manualmente um acesso concedido antes do prazo (regra de
// negócio 14) — só o DONO da própria barbearia daquele acesso.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const acesso = await db.acessoPlataforma.findUnique({ where: { id: params.id } });
  if (!acesso || acesso.barbeariaId !== sessao.barbeariaId) {
    return NextResponse.json({ erro: "Acesso não encontrado" }, { status: 404 });
  }
  if (acesso.revogadoEm) {
    return NextResponse.json({ erro: "Esse acesso já foi revogado" }, { status: 409 });
  }

  const atualizado = await db.acessoPlataforma.update({
    where: { id: params.id },
    data: { revogadoEm: new Date() },
    include: { usuario: { select: { nome: true, email: true } } },
  });

  return NextResponse.json({ acesso: atualizado });
}
