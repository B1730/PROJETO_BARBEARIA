import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao, sessaoTemPrivilegioDeChefe } from "@/lib/exigirSessao";

// "HH:MM" com hora 00-23 e minuto 00-59 — o regex sozinho deixava passar
// algo como "25:99", que depois estourava silenciosamente no setUTCHours()
// de src/lib/horarios.ts em vez de dar um erro claro pro barbeiro.
const horaValida = (valor: string) => {
  const [hora, minuto] = valor.split(":").map(Number);
  return hora >= 0 && hora <= 23 && minuto >= 0 && minuto <= 59;
};

// Só de meia em meia hora (minuto 00 ou 30) — mantém os horários que o
// cliente vê batendo certinho com a grade de 30min (09:00, 09:30, 10:00...)
// em vez de janelas com início/fim "quebrado" tipo 09:15.
const horaRedonda = (valor: string) => {
  const minuto = Number(valor.split(":")[1]);
  return minuto === 0 || minuto === 30;
};

const schema = z
  .object({
    diaDaSemana: z.number().int().min(0).max(6),
    horaInicio: z.string().regex(/^\d{2}:\d{2}$/).refine(horaValida, "Hora inválida").refine(horaRedonda, "Hora precisa ser em ponto ou meia (ex: 09:00, 09:30)"),
    horaFim: z.string().regex(/^\d{2}:\d{2}$/).refine(horaValida, "Hora inválida").refine(horaRedonda, "Hora precisa ser em ponto ou meia (ex: 18:00, 18:30)"),
  })
  // Comparação de string funciona porque o formato é sempre "HH:MM" com
  // zero à esquerda. Sem isso, uma janela invertida (ex.: início 18:00, fim
  // 09:00) era aceita e virava silenciosamente zero horários livres, sem
  // nenhum aviso pro barbeiro sobre o que está errado.
  .refine((dados) => dados.horaInicio < dados.horaFim, {
    message: "Hora de início precisa ser antes da hora de fim",
    path: ["horaFim"],
  });

// GET: disponibilidade do barbeiro logado. Com ?barbeiroId=<outro>, o
// dono ou o barbeiro chefe da barbearia consegue ver (só ver — não editar)
// a disponibilidade de um colega, pra saber quando cada um trabalha.
export async function GET(req: NextRequest) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const alvoId = req.nextUrl.searchParams.get("barbeiroId");
  let barbeiroId: string;

  if (!alvoId) {
    if (sessao.papel !== "BARBEIRO") {
      return NextResponse.json({ erro: "Informe o barbeiro (barbeiroId)" }, { status: 400 });
    }
    barbeiroId = sessao.usuarioId;
  } else if (alvoId === sessao.usuarioId) {
    barbeiroId = sessao.usuarioId;
  } else {
    if (!(await sessaoTemPrivilegioDeChefe(sessao))) {
      return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
    }
    const alvo = await db.usuario.findUnique({ where: { id: alvoId } });
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

// POST: barbeiro adiciona uma janela de disponibilidade
// (ex: segunda-feira, das 09:00 às 18:00)
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao(["BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const dados = schema.safeParse(await req.json());
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
