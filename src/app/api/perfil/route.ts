import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";

const schema = z.object({
  whatsapp: z.string().min(8).optional().or(z.literal("")),
  callmebotApiKey: z.string().min(1).optional().or(z.literal("")),
  fotoUrl: z.string().url().optional().or(z.literal("")),
  // Só o DONO usa isso (ver Usuario.atendeComoBarbeiro) — um BARBEIRO
  // mandando esse campo é simplesmente ignorado, ele já atende sempre.
  atendeComoBarbeiro: z.boolean().optional(),
});

// GET: o próprio usuário (barbeiro, dono, ou cliente) vê os próprios
// dados de WhatsApp/notificação/foto. CLIENTE só usa o campo whatsapp (pra
// o barbeiro poder entrar em contato se precisar, ver GET /api/agendamentos)
// — os outros campos não se aplicam a esse papel, mas não custa nada
// devolver/aceitar de forma uniforme.
export async function GET() {
  const sessao = await exigirSessao(["BARBEIRO", "DONO", "CLIENTE"]);
  if (sessao instanceof NextResponse) return sessao;

  const usuario = await db.usuario.findUnique({
    where: { id: sessao.usuarioId },
    select: { id: true, nome: true, email: true, whatsapp: true, callmebotApiKey: true, fotoUrl: true, atendeComoBarbeiro: true },
  });

  return NextResponse.json({ usuario });
}

// PATCH: atualiza o próprio número/apikey do CallMeBot, foto, e (só pro
// DONO) o interruptor "também corto cabelo".
export async function PATCH(req: NextRequest) {
  const sessao = await exigirSessao(["BARBEIRO", "DONO", "CLIENTE"]);
  if (sessao instanceof NextResponse) return sessao;

  const dados = schema.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  // !== undefined em cada campo — sem isso, uma chamada que só manda um dos
  // campos (ex.: só a foto) zerava os outros silenciosamente, já que todos
  // são opcionais no schema. Hoje a única tela que chama isso pra
  // whatsapp/callmebotApiKey/fotoUrl sempre manda os três juntos, mas o
  // contrato da API não deveria depender disso.
  const usuario = await db.usuario.update({
    where: { id: sessao.usuarioId },
    data: {
      // Normaliza pra só dígitos — quem digita com formatação
      // (+55 (11) 99999-9999) não deve deixar o link "Falar no WhatsApp"
      // (mostrado ao cliente) quebrado.
      ...(dados.data.whatsapp !== undefined ? { whatsapp: dados.data.whatsapp.replace(/\D/g, "") || null } : {}),
      ...(dados.data.callmebotApiKey !== undefined ? { callmebotApiKey: dados.data.callmebotApiKey || null } : {}),
      ...(dados.data.fotoUrl !== undefined ? { fotoUrl: dados.data.fotoUrl || null } : {}),
      ...(dados.data.atendeComoBarbeiro !== undefined && sessao.papel === "DONO"
        ? { atendeComoBarbeiro: dados.data.atendeComoBarbeiro }
        : {}),
    },
    select: { id: true, nome: true, email: true, whatsapp: true, callmebotApiKey: true, fotoUrl: true, atendeComoBarbeiro: true },
  });

  return NextResponse.json({ usuario });
}
