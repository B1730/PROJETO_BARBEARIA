import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

const schema = z.object({
  nome: z.string().min(2),
  precoBase: z.number().positive(),
  duracaoMinutos: z.number().int().positive().default(30),
  imagemUrl: z.string().url().optional(),
});

// GET: lista os serviços da barbearia do usuário logado (dono ou barbeiro)
export async function GET() {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const servicos = await db.servico.findMany({
    where: { barbeariaId: sessao.barbeariaId! },
    include: {
      barbeiros: {
        select: { barbeiroId: true, preco: true, barbeiro: { select: { id: true, nome: true } } },
      },
    },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json({ servicos });
}

// POST: cria um novo corte/serviço.
// - DONO cria pra barbearia toda (qualquer barbeiro pode oferecer).
// - BARBEIRO também pode cadastrar, mas o corte fica só dele — criamos um
//   ServicoBarbeiro vinculando ao próprio barbeiro, que é o que faz o
//   fluxo do cliente (e a validação em /api/agendamentos) considerarem que
//   só esse barbeiro oferece esse corte.
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const dados = schema.safeParse(await req.json());
  if (!dados.success) {
    return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  }

  const servico = await db.servico.create({
    data: { ...dados.data, barbeariaId: sessao.barbeariaId! },
  });

  if (sessao.papel === "BARBEIRO") {
    await db.servicoBarbeiro.create({
      data: { servicoId: servico.id, barbeiroId: sessao.usuarioId, preco: dados.data.precoBase },
    });
  }

  return NextResponse.json({ servico });
}
