// Gera o slug usado na URL pública da barbearia a partir do nome digitado.
// O sufixo com timestamp evita colisão entre duas barbearias com nome parecido
// (ex: duas "Barbearia do Zé" em cidades diferentes).
export function gerarSlug(nome: string): string {
  const base = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}-${Date.now().toString(36)}`;
}
