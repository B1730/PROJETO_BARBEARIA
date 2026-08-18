import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";
import { criarHashSenha } from "@/lib/auth";

const schema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  senhaInicial: z.string().min(6),
});

// GET: lista os barbeiros da barbearia do usuário logado
export async function GET() {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const barbeiros = await db.usuario.findMany({
    where: { barbeariaId: sessao.barbeariaId!, papel: "BARBEIRO" },
    select: { id: true, nome: true, email: true, criadoEm: true },
  });

  return NextResponse.json({ barbeiros });
}

// POST: dono cadastra um barbeiro novo diretamente (define uma senha inicial
// que o barbeiro deve trocar no primeiro acesso — troca de senha fica como
// próximo passo de evolução do sistema).
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao(["DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const dados = schema.safeParse(await req.json());
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const jaExiste = await db.usuario.findUnique({ where: { email: dados.data.email } });
  if (jaExiste) return NextResponse.json({ erro: "Este e-mail já está em uso" }, { status: 409 });

  const barbeiro = await db.usuario.create({
    data: {
      nome: dados.data.nome,
      email: dados.data.email,
      senhaHash: await criarHashSenha(dados.data.senhaInicial),
      papel: "BARBEIRO",
      barbeariaId: sessao.barbeariaId!,
    },
  });

  return NextResponse.json({ barbeiro: { id: barbeiro.id, nome: barbeiro.nome, email: barbeiro.email } });
}
