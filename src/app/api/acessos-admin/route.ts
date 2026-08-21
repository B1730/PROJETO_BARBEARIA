import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";
import { normalizarEmail } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  duracaoDias: z.number().int().positive().max(90),
  motivo: z.string().max(500).optional().or(z.literal("")),
});

// GET: histórico de acessos de plataforma já concedidos pela barbearia do
// dono logado (ativos, expirados e revogados) — regra de negócio 14, item
// de transparência. Só o DONO vê isso (nem o chefe, nem um barbeiro comum).
export async function GET() {
  const sessao = await exigirSessao(["DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const acessos = await db.acessoPlataforma.findMany({
    where: { barbeariaId: sessao.barbeariaId! },
    include: { usuario: { select: { nome: true, email: true } } },
    orderBy: { concedidoEm: "desc" },
  });

  return NextResponse.json({ acessos });
}

// POST: concede um acesso novo — só o DONO da barbearia (nunca o chefe,
// nunca um barbeiro comum, ver regra de negócio 14). Identifica quem
// recebe pelo e-mail; a conta precisa já existir com papel ADMIN (essas
// contas nunca nascem por rota pública, ver scripts/criar-admin-plataforma.ts
// e regra de negócio 7).
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao(["DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const dados = schema.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const admin = await db.usuario.findUnique({ where: { email: normalizarEmail(dados.data.email) } });
  if (!admin || admin.papel !== "ADMIN") {
    return NextResponse.json({ erro: "Nenhum administrador de plataforma encontrado com esse e-mail" }, { status: 404 });
  }

  const expiraEm = new Date(Date.now() + dados.data.duracaoDias * 24 * 60 * 60 * 1000);
  const acesso = await db.acessoPlataforma.create({
    data: {
      usuarioId: admin.id,
      barbeariaId: sessao.barbeariaId!,
      motivo: dados.data.motivo || null,
      expiraEm,
    },
    include: { usuario: { select: { nome: true, email: true } } },
  });

  return NextResponse.json({ acesso });
}
