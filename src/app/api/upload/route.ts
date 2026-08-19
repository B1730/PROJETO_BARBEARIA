import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { exigirSessao } from "@/lib/exigirSessao";
import { enviarImagem, detectarTipoImagem } from "@/lib/storage";

const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5MB — mesmo limite configurado no bucket

// POST /api/upload — multipart/form-data com campos "arquivo" e "pasta"
// ("cortes" ou "barbeiros"). Devolve a URL pública da imagem no Supabase
// Storage. Usado antes de POST /api/servicos ou PATCH /api/perfil, que só
// guardam a URL — o upload em si é sempre esse passo separado.
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const form = await req.formData();
  const arquivo = form.get("arquivo");
  const pasta = form.get("pasta");
  if (!(arquivo instanceof File) || (pasta !== "cortes" && pasta !== "barbeiros")) {
    return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  }

  const extensao = TIPOS_PERMITIDOS[arquivo.type];
  if (!extensao) {
    return NextResponse.json({ erro: "Envie uma imagem JPG, PNG ou WEBP" }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ erro: "A imagem precisa ter até 5MB" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await arquivo.arrayBuffer());

    // O Content-Type do multipart é só o que o cliente declarou — confere
    // a assinatura binária real do arquivo antes de aceitar.
    const tipoReal = detectarTipoImagem(bytes);
    if (!tipoReal || tipoReal !== arquivo.type) {
      return NextResponse.json({ erro: "O arquivo enviado não é uma imagem JPG, PNG ou WEBP válida" }, { status: 400 });
    }

    const url = await enviarImagem({
      pasta,
      nomeArquivo: `${randomUUID()}.${extensao}`,
      arquivo: bytes,
      tipoConteudo: tipoReal,
    });
    return NextResponse.json({ url });
  } catch (erro) {
    console.error(erro);
    return NextResponse.json({ erro: "Não foi possível enviar a imagem" }, { status: 502 });
  }
}
