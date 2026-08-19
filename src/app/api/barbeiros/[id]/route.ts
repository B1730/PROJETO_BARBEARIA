import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

const schema = z.object({
  ehChefe: z.boolean(),
});

// PATCH /api/barbeiros/[id] — só o dono promove/rebaixa o barbeiro chefe
// da barbearia. "Um chefe só por barbearia": ao promover, rebaixa
// primeiro qualquer chefe atual (transação) antes de promover o alvo —
// nunca fica mais de um barbeiro com ehChefe:true na mesma barbearia.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const dados = schema.safeParse(await req.json());
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const alvo = await db.usuario.findUnique({ where: { id: params.id } });
  if (!alvo || alvo.papel !== "BARBEIRO" || alvo.barbeariaId !== sessao.barbeariaId) {
    return NextResponse.json({ erro: "Barbeiro não encontrado" }, { status: 404 });
  }

  if (dados.data.ehChefe) {
    await db.$transaction([
      db.usuario.updateMany({
        where: { barbeariaId: sessao.barbeariaId!, papel: "BARBEIRO", ehChefe: true },
        data: { ehChefe: false },
      }),
      db.usuario.update({ where: { id: alvo.id }, data: { ehChefe: true } }),
    ]);
  } else {
    await db.usuario.update({ where: { id: alvo.id }, data: { ehChefe: false } });
  }

  return NextResponse.json({ ok: true });
}
