import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { criarHashSenha, criarSessao, normalizarEmail } from "@/lib/auth";
import { gerarSlug } from "@/lib/slug";

// Cadastro público só cria CLIENTE ou DONO (que cria a própria barbearia).
// BARBEIRO nunca se autocadastra — só existe pelo caminho já protegido
// POST /api/barbeiros (o dono logado cria e define a senha inicial). Um
// papel: "BARBEIRO" aqui já existiu e permitia entrar em QUALQUER
// barbearia existente só sabendo o id dela — e esse id é descoberto pela
// rota pública GET /api/barbearias/[slug]. Ver CLAUDE.md.
const schema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  senha: z.string().min(6),
  papel: z.enum(["CLIENTE", "DONO"]),
  nomeBarbearia: z.string().optional(), // obrigatório para DONO
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const dados = schema.safeParse(body);
  if (!dados.success) {
    return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  }
  const { nome, senha, papel, nomeBarbearia } = dados.data;
  const email = normalizarEmail(dados.data.email);

  if (papel === "DONO" && !nomeBarbearia) {
    return NextResponse.json({ erro: "Informe o nome da barbearia" }, { status: 400 });
  }

  const senhaHash = await criarHashSenha(senha);

  try {
    // Barbearia + Usuario numa única transação: se o e-mail colidir com um
    // cadastro concorrente, a transação inteira desfaz — sem isso, sobrava
    // uma Barbearia órfã (criada, mas sem dono) toda vez que o segundo
    // usuario.create falhava por e-mail duplicado.
    const usuario = await db.$transaction(async (tx) => {
      let barbeariaId: string | null = null;
      if (papel === "DONO") {
        const barbearia = await tx.barbearia.create({
          data: { nome: nomeBarbearia!, slug: gerarSlug(nomeBarbearia!) },
        });
        barbeariaId = barbearia.id;
      }
      return tx.usuario.create({
        data: { nome, email, senhaHash, papel, barbeariaId },
      });
    });

    await criarSessao({
      usuarioId: usuario.id,
      papel: usuario.papel,
      barbeariaId: usuario.barbeariaId,
    });

    return NextResponse.json({ ok: true, usuario: { id: usuario.id, nome: usuario.nome, papel: usuario.papel } });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return NextResponse.json({ erro: "Este e-mail já está cadastrado" }, { status: 409 });
    }
    throw erro;
  }
}
