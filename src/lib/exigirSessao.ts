import { NextResponse } from "next/server";
import { db } from "./db";
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

/**
 * true pro DONO (acesso total já garantido) e pro BARBEIRO promovido a
 * chefe (ver Usuario.ehChefe). Sempre confere direto no banco, nunca
 * confia num campo salvo no cookie de sessão — assim uma promoção ou
 * rebaixamento feito pelo dono tem efeito imediato, sem esperar o usuário
 * deslogar/logar de novo.
 */
export async function sessaoTemPrivilegioDeChefe(sessao: SessaoPayload): Promise<boolean> {
  if (sessao.papel === "DONO") return true;
  if (sessao.papel !== "BARBEIRO") return false;
  const usuario = await db.usuario.findUnique({ where: { id: sessao.usuarioId }, select: { ehChefe: true } });
  return usuario?.ehChefe ?? false;
}

/**
 * true pra todo BARBEIRO (sempre atende) e pro DONO que ativou
 * `atendeComoBarbeiro` (ver PATCH /api/perfil) — usado em toda rota onde a
 * pessoa vai agir como um barbeiro de verdade (cadastrar a própria
 * Disponibilidade, ser listada pro cliente escolher, confirmar/recusar um
 * agendamento próprio). Sempre confere direto no banco, mesmo padrão de
 * sessaoTemPrivilegioDeChefe — desligar o atendimento tem efeito imediato.
 */
export async function sessaoAtendeComoBarbeiro(sessao: SessaoPayload): Promise<boolean> {
  if (sessao.papel === "BARBEIRO") return true;
  if (sessao.papel !== "DONO") return false;
  const usuario = await db.usuario.findUnique({ where: { id: sessao.usuarioId }, select: { atendeComoBarbeiro: true } });
  return usuario?.atendeComoBarbeiro ?? false;
}
