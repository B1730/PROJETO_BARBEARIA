import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

const schema = z.object({
  diaDaSemana: z.number().int().min(0).max(6),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/),
  horaFim: z.string().regex(/^\d{2}:\d{2}$/),
});

// GET: disponibilidade do barbeiro logado
export async function GET() {
  const sessao = await exigirSessao(["BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const disponibilidades = await db.disponibilidade.findMany({
    where: { barbeiroId: sessao.usuarioId },
    orderBy: { diaDaSemana: "asc" },
  });

  return NextResponse.json({ disponibilidades });
}

// POST: barbeiro adiciona uma janela de disponibilidade
// (ex: segunda-feira, das 09:00 às 18:00)
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao(["BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const dados = schema.safeParse(await req.json());
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const disponibilidade = await db.disponibilidade.create({
    data: { ...dados.data, barbeiroId: sessao.usuarioId },
  });

  return NextResponse.json({ disponibilidade });
}
