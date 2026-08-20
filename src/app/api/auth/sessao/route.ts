import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

// GET /api/auth/sessao
// Devolve o usuário logado (a partir do cookie) e, se ele pertencer a uma
// barbearia (BARBEIRO/DONO), o nome dela — usado pelo cabeçalho compartilhado
// pra mostrar quem está logado sem precisar guardar isso em outro lugar.
export async function GET() {
  const sessao = await exigirSessao();
  if (sessao instanceof NextResponse) return sessao;

  // As duas buscas são independentes (nenhuma usa o resultado da outra —
  // barbearia já sai direto de sessao.barbeariaId, vindo do JWT), então
  // rodam em paralelo em vez de uma esperar a outra.
  const [usuario, barbearia] = await Promise.all([
    db.usuario.findUnique({
      where: { id: sessao.usuarioId },
      select: { id: true, nome: true, papel: true, ehChefe: true },
    }),
    sessao.barbeariaId
      ? db.barbearia.findUnique({ where: { id: sessao.barbeariaId }, select: { id: true, nome: true } })
      : Promise.resolve(null),
  ]);
  if (!usuario) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });

  return NextResponse.json({ usuario, barbearia });
}
