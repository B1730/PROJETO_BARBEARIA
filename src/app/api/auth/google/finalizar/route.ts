import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { criarSessao, lerTokenGooglePendente } from "@/lib/auth";
import { gerarSlug } from "@/lib/slug";

const COOKIE_VINCULO = "google_pendente_vinculo";

const schema = z.object({
  token: z.string(),
  // Só um dos dois é obrigatório de verdade, dependendo de identidade.intent
  // (o token assinado, nunca o que o cliente manda) — DONO precisa de
  // nomeBarbearia, CLIENTE precisa de whatsapp (regra de negócio 12).
  nomeBarbearia: z.string().optional(),
  whatsapp: z.string().optional(),
});

// POST /api/auth/google/finalizar
// Último passo do cadastro com Google quando falta um dado que o Google não
// fornece: recebe o token assinado gerado em /api/auth/google/callback
// (prova que o e-mail já foi confirmado pelo Google, e carrega o intent de
// forma confiável) mais o campo que faltava, e só então cria a conta.
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

  if (identidade.intent === "DONO" && !dados.data.nomeBarbearia) {
    return NextResponse.json({ erro: "Informe o nome da barbearia" }, { status: 400 });
  }
  const whatsapp = dados.data.whatsapp ? dados.data.whatsapp.replace(/\D/g, "") : null;
  if (identidade.intent === "CLIENTE" && (!whatsapp || whatsapp.length < 8)) {
    return NextResponse.json({ erro: "Informe seu WhatsApp" }, { status: 400 });
  }

  try {
    // Reconfere dentro da transação: pode ter se cadastrado por outro
    // caminho enquanto preenchia o campo que faltava (corrida de e-mail).
    const usuario = await db.$transaction(async (tx) => {
      const existente = await tx.usuario.findUnique({ where: { email: identidade.email } });
      if (existente) return existente;

      if (identidade.intent === "DONO") {
        const barbearia = await tx.barbearia.create({
          data: { nome: dados.data.nomeBarbearia!, slug: gerarSlug(dados.data.nomeBarbearia!) },
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
      }

      return tx.usuario.create({
        data: {
          nome: identidade.nome,
          email: identidade.email,
          papel: "CLIENTE",
          senhaHash: null,
          whatsapp,
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
