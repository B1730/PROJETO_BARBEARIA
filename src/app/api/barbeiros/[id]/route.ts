import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
// Isolamento serializable (mesmo padrão de POST /api/agendamentos) —
// sem isso, duas promoções concorrentes pra barbeiros diferentes podiam
// cada uma ver "nenhum chefe ainda" e as duas terminarem com sucesso,
// deixando dois chefes ao mesmo tempo.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const dados = schema.safeParse(await req.json());
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const alvo = await db.usuario.findUnique({ where: { id: params.id } });
  if (!alvo || alvo.papel !== "BARBEIRO" || alvo.barbeariaId !== sessao.barbeariaId) {
    return NextResponse.json({ erro: "Barbeiro não encontrado" }, { status: 404 });
  }

  try {
    if (dados.data.ehChefe) {
      await db.$transaction(
        async (tx) => {
          await tx.usuario.updateMany({
            where: { barbeariaId: sessao.barbeariaId!, papel: "BARBEIRO", ehChefe: true },
            data: { ehChefe: false },
          });
          await tx.usuario.update({ where: { id: alvo.id }, data: { ehChefe: true } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } else {
      await db.usuario.update({ where: { id: alvo.id }, data: { ehChefe: false } });
    }
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2034") {
      return NextResponse.json({ erro: "Alguém mais mexeu nisso ao mesmo tempo, tente de novo" }, { status: 409 });
    }
    throw erro;
  }

  return NextResponse.json({ ok: true });
}
