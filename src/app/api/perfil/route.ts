import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

const schema = z.object({
  whatsapp: z.string().min(8).optional().or(z.literal("")),
  callmebotApiKey: z.string().min(1).optional().or(z.literal("")),
});

// GET: o próprio barbeiro vê seus dados de WhatsApp/notificação
export async function GET() {
  const sessao = await exigirSessao(["BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const usuario = await db.usuario.findUnique({
    where: { id: sessao.usuarioId },
    select: { id: true, nome: true, email: true, whatsapp: true, callmebotApiKey: true },
  });

  return NextResponse.json({ usuario });
}

// PATCH: barbeiro atualiza o próprio número/apikey do CallMeBot
export async function PATCH(req: NextRequest) {
  const sessao = await exigirSessao(["BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const dados = schema.safeParse(await req.json());
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const usuario = await db.usuario.update({
    where: { id: sessao.usuarioId },
    data: {
      whatsapp: dados.data.whatsapp || null,
      callmebotApiKey: dados.data.callmebotApiKey || null,
    },
    select: { id: true, nome: true, email: true, whatsapp: true, callmebotApiKey: true },
  });

  return NextResponse.json({ usuario });
}
