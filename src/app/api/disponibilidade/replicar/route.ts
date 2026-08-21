import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao, sessaoAtendeComoBarbeiro } from "@/lib/exigirSessao";

const schema = z.object({
  diaOrigem: z.number().int().min(0).max(6),
  diasDestino: z.array(z.number().int().min(0).max(6)).min(1),
});

// POST: pega todas as janelas já cadastradas num dia (diaOrigem) e cria as
// mesmas janelas em outros dias (diasDestino), sem precisar recriar uma por
// uma. Duplicata (mesmo dia+início+fim já existente) é ignorada em
// silêncio via skipDuplicates — a mesma trava de banco de sempre
// (@@unique em Disponibilidade), só que sem precisar tratar erro por erro
// numa operação que pode criar várias janelas em vários dias de uma vez.
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao(["BARBEIRO", "DONO"]);
  if (sessao instanceof NextResponse) return sessao;
  if (!(await sessaoAtendeComoBarbeiro(sessao))) {
    return NextResponse.json({ erro: "Ative \"também corto cabelo\" no seu perfil antes de cadastrar horários" }, { status: 403 });
  }

  const dados = schema.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const diasDestino = [...new Set(dados.data.diasDestino)].filter((d) => d !== dados.data.diaOrigem);
  if (diasDestino.length === 0) {
    return NextResponse.json({ erro: "Escolha pelo menos um dia diferente do dia de origem" }, { status: 400 });
  }

  const janelasOrigem = await db.disponibilidade.findMany({
    where: { barbeiroId: sessao.usuarioId, diaDaSemana: dados.data.diaOrigem },
  });
  if (janelasOrigem.length === 0) {
    return NextResponse.json({ erro: "Esse dia não tem nenhuma janela cadastrada pra replicar" }, { status: 400 });
  }

  const paraCriar = diasDestino.flatMap((dia) =>
    janelasOrigem.map((j) => ({
      barbeiroId: sessao.usuarioId,
      diaDaSemana: dia,
      horaInicio: j.horaInicio,
      horaFim: j.horaFim,
    }))
  );

  const resultado = await db.disponibilidade.createMany({ data: paraCriar, skipDuplicates: true });
  return NextResponse.json({ criadas: resultado.count, tentadas: paraCriar.length });
}
