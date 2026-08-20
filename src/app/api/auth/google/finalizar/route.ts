import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { criarSessao, lerTokenGooglePendente } from "@/lib/auth";
import { gerarSlug } from "@/lib/slug";

const COOKIE_VINCULO = "google_pendente_vinculo";

const schema = z.object({
  token: z.string(),
  nomeBarbearia: z.string().min(2),
});

// POST /api/auth/google/finalizar
// Último passo do "cadastrar barbearia com Google": recebe o token assinado
// gerado em /api/auth/google/callback (prova que o e-mail já foi confirmado
// pelo Google) mais o nome da barbearia, e só então cria a conta.
export async function POST(req: NextRequest) {
  const dados = schema.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  const identidade = await lerTokenGooglePendente(dados.data.token);
  if (!identidade) {
    return NextResponse.json({ erro: "Sessão expirada — entre com o Google de novo" }, { status: 400 });
  }

  // O token sozinho é um bearer credential que pode vazar numa URL — exigir
  // que o cookie httpOnly gravado no mesmo navegador que recebeu o
  // callback do Google também esteja presente e bata com o token evita que
  // alguém que só obteve a URL (sem ter passado pelo login) finalize o
  // cadastro no lugar da pessoa dona do e-mail.
  const vinculoCookie = req.cookies.get(COOKIE_VINCULO)?.value;
  if (!vinculoCookie || vinculoCookie !== identidade.vinculo) {
    return NextResponse.json(
      { erro: "Não foi possível confirmar esse cadastro nesse navegador — entre com o Google de novo" },
      { status: 400 }
    );
  }

  try {
    // Reconfere dentro da transação: pode ter se cadastrado por outro
    // caminho enquanto preenchia o nome da barbearia (corrida de e-mail).
    const usuario = await db.$transaction(async (tx) => {
      const existente = await tx.usuario.findUnique({ where: { email: identidade.email } });
      if (existente) return existente;

      const barbearia = await tx.barbearia.create({
        data: { nome: dados.data.nomeBarbearia, slug: gerarSlug(dados.data.nomeBarbearia) },
      });
      return tx.usuario.create({
        data: {
          nome: identidade.nome,
          email: identidade.email,
          papel: "DONO",
          senhaHash: null,
          barbeariaId: barbearia.id,
        },
      });
    });

    await criarSessao({ usuarioId: usuario.id, papel: usuario.papel, barbeariaId: usuario.barbeariaId });
    const resposta = NextResponse.json({ ok: true });
    resposta.cookies.delete({ name: COOKIE_VINCULO, path: "/api/auth/google/finalizar" });
    return resposta;
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return NextResponse.json({ erro: "Este e-mail já está cadastrado — entre normalmente" }, { status: 409 });
    }
    throw erro;
  }
}
