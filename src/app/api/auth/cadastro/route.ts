import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { criarHashSenha, criarSessao } from "@/lib/auth";

const schema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  senha: z.string().min(6),
  papel: z.enum(["CLIENTE", "BARBEIRO", "DONO"]),
  // Obrigatório para DONO (cria a barbearia) e BARBEIRO (entra em uma existente)
  nomeBarbearia: z.string().optional(),
  barbeariaId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const dados = schema.safeParse(body);
  if (!dados.success) {
    return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  }
  const { nome, email, senha, papel, nomeBarbearia, barbeariaId } = dados.data;

  const jaExiste = await db.usuario.findUnique({ where: { email } });
  if (jaExiste) {
    return NextResponse.json({ erro: "Este e-mail já está cadastrado" }, { status: 409 });
  }

  let barbeariaFinalId: string | null = null;

  if (papel === "DONO") {
    if (!nomeBarbearia) {
      return NextResponse.json({ erro: "Informe o nome da barbearia" }, { status: 400 });
    }
    const slug = nomeBarbearia
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const barbearia = await db.barbearia.create({
      data: { nome: nomeBarbearia, slug: `${slug}-${Date.now().toString(36)}` },
    });
    barbeariaFinalId = barbearia.id;
  }

  if (papel === "BARBEIRO") {
    if (!barbeariaId) {
      return NextResponse.json({ erro: "Informe a barbearia" }, { status: 400 });
    }
    const barbeariaExiste = await db.barbearia.findUnique({ where: { id: barbeariaId } });
    if (!barbeariaExiste) {
      return NextResponse.json({ erro: "Barbearia não encontrada" }, { status: 400 });
    }
    barbeariaFinalId = barbeariaId;
  }

  const usuario = await db.usuario.create({
    data: {
      nome,
      email,
      senhaHash: await criarHashSenha(senha),
      papel,
      barbeariaId: barbeariaFinalId,
    },
  });

  await criarSessao({
    usuarioId: usuario.id,
    papel: usuario.papel,
    barbeariaId: usuario.barbeariaId,
  });

  return NextResponse.json({ ok: true, usuario: { id: usuario.id, nome: usuario.nome, papel: usuario.papel } });
}
