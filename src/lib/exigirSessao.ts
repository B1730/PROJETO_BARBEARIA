import { NextResponse } from "next/server";
import { pegarSessao, SessaoPayload } from "./auth";

/**
 * Usa no início de uma rota de API:
 *   const sessao = await exigirSessao(["DONO"]);
 *   if (sessao instanceof NextResponse) return sessao; // não autorizado
 */
export async function exigirSessao(
  papeisPermitidos?: SessaoPayload["papel"][]
): Promise<SessaoPayload | NextResponse> {
  const sessao = await pegarSessao();
  if (!sessao) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }
  if (papeisPermitidos && !papeisPermitidos.includes(sessao.papel)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }
  return sessao;
}
