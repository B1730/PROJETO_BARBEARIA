// Confere a assinatura binária real do arquivo (magic bytes), não o
// Content-Type que o cliente declarou no multipart — esse header é
// livremente escolhido por quem monta a requisição (não precisa ser um
// navegador de verdade), então validar só por ele deixava passar qualquer
// conteúdo disfarçado de imagem.
export function detectarTipoImagem(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

// Upload de imagens (fotos de corte, fotos de barbeiro) pro Supabase
// Storage — bucket público "uploads", criado com limite de 5MB e só
// aceitando jpeg/png/webp. Usa a service_role key, que só pode ser usada
// no servidor (nunca expor no client) — é o backend quem já garante, via
// exigirSessao, que só DONO/BARBEIRO chegam até aqui.
export async function enviarImagem(params: {
  pasta: "cortes" | "barbeiros";
  nomeArquivo: string;
  arquivo: Buffer;
  tipoConteudo: string;
}): Promise<string> {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("Supabase Storage não configurado (faltam SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)");
  }

  const caminho = `${params.pasta}/${params.nomeArquivo}`;
  const resp = await fetch(`${url}/storage/v1/object/uploads/${caminho}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      "Content-Type": params.tipoConteudo,
      "x-upsert": "true",
    },
    body: new Uint8Array(params.arquivo),
  });

  if (!resp.ok) {
    throw new Error(`Falha ao enviar imagem (${resp.status}): ${await resp.text()}`);
  }

  return `${url}/storage/v1/object/public/uploads/${caminho}`;
}
