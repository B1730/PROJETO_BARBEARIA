import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { exigirSessao, sessaoAtendeComoBarbeiro, sessaoTemPrivilegioDeChefe } from "@/lib/exigirSessao";
import { schemaDisponibilidade as schema } from "@/lib/validacaoDisponibilidade";

// GET: disponibilidade do barbeiro logado. Com ?barbeiroId=<outro>, o
// dono ou o barbeiro chefe da barbearia consegue ver (só ver — não editar)
// a disponibilidade de um colega, pra saber quando cada um trabalha.
export async function GET(req: NextRequest) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const alvoId = req.nextUrl.searchParams.get("barbeiroId");
  let barbeiroId: string;

  if (!alvoId) {
    if (!(await sessaoAtendeComoBarbeiro(sessao))) {
      return NextResponse.json({ erro: "Informe o barbeiro (barbeiroId)" }, { status: 400 });
    }
    barbeiroId = sessao.usuarioId;
  } else if (alvoId === sessao.usuarioId) {
    barbeiroId = sessao.usuarioId;
  } else {
    if (!(await sessaoTemPrivilegioDeChefe(sessao))) {
      return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
    }
    const alvo = await db.usuario.findUnique({ where: { id: alvoId }, select: { papel: true, barbeariaId: true } });
    if (!alvo || alvo.papel !== "BARBEIRO" || alvo.barbeariaId !== sessao.barbeariaId) {
      return NextResponse.json({ erro: "Barbeiro não encontrado" }, { status: 404 });
    }
    barbeiroId = alvoId;
  }

  const disponibilidades = await db.disponibilidade.findMany({
    where: { barbeiroId },
    orderBy: { diaDaSemana: "asc" },
  });

  return NextResponse.json({ disponibilidades });
}

// POST: barbeiro (ou dono que também atende, ver regra de negócio 10)
// adiciona uma janela de disponibilidade (ex: segunda-feira, das 09:00 às 18:00)
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao(["BARBEIRO", "DONO"]);
  if (sessao instanceof NextResponse) return sessao;
  if (!(await sessaoAtendeComoBarbeiro(sessao))) {
    return NextResponse.json({ erro: "Ative \"também corto cabelo\" no seu perfil antes de cadastrar horários" }, { status: 403 });
  }

  const dados = schema.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  try {
    const disponibilidade = await db.disponibilidade.create({
      data: { ...dados.data, barbeiroId: sessao.usuarioId },
    });
    return NextResponse.json({ disponibilidade });
  } catch (erro) {
    // Mesmo dia + mesmo início + mesmo fim já cadastrado antes (trava de
    // banco — ver @@unique em Disponibilidade no schema). Um horário
    // diferente no mesmo dia continua permitido normalmente.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return NextResponse.json({ erro: "Você já tem esse horário cadastrado nesse dia" }, { status: 409 });
    }
    throw erro;
  }
}
