import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { conferirSenha, criarSessao } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const dados = schema.safeParse(body);
  if (!dados.success) {
    return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  }

  const usuario = await db.usuario.findUnique({ where: { email: dados.data.email } });
  if (!usuario || !usuario.senhaHash) {
    return NextResponse.json({ erro: "E-mail ou senha incorretos" }, { status: 401 });
  }
  if (!(await conferirSenha(dados.data.senha, usuario.senhaHash))) {
    return NextResponse.json({ erro: "E-mail ou senha incorretos" }, { status: 401 });
  }

  await criarSessao({
    usuarioId: usuario.id,
    papel: usuario.papel,
    barbeariaId: usuario.barbeariaId,
  });

  return NextResponse.json({ ok: true, usuario: { id: usuario.id, nome: usuario.nome, papel: usuario.papel } });
}
