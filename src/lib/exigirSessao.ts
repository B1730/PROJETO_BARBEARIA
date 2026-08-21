import { NextRequest, NextResponse } from "next/server";
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

/**
 * true só se esse ADMIN tem, agora mesmo, um acesso concedido pelo DONO
 * daquela barbearia específica que ainda não expirou nem foi revogado —
 * confere expiraEm/revogadoEm direto no banco a cada chamada, nunca em
 * cache, então revogar ou deixar vencer tem efeito imediato mesmo com o
 * cookie de sessão do ADMIN ainda válido (ver regra de negócio 14). Toda
 * rota em src/app/api/admin/* chama isso depois de exigirSessao(["ADMIN"]),
 * sempre com o barbeariaId vindo explícito da query string — a sessão do
 * ADMIN nunca carrega um barbeariaId fixo (pode ter acesso a mais de uma
 * barbearia ao mesmo tempo, diferente de BARBEIRO/DONO).
 */
export async function acessoAdminValido(usuarioId: string, barbeariaId: string): Promise<boolean> {
  const acesso = await db.acessoPlataforma.findFirst({
    where: { usuarioId, barbeariaId, revogadoEm: null, expiraEm: { gt: new Date() } },
  });
  return !!acesso;
}

/**
 * Usa no início de toda rota em src/app/api/admin/*:
 *   const acesso = await exigirAcessoAdmin(req);
 *   if (acesso instanceof NextResponse) return acesso;
 *   const { barbeariaId } = acesso;
 * Junta em um passo só: exigir sessão ADMIN, exigir ?barbeariaId= na
 * query string (a sessão do ADMIN não carrega barbearia fixa), e conferir
 * o acesso concedido pra ela — sempre na hora, nunca em cache.
 */
export async function exigirAcessoAdmin(
  req: NextRequest
): Promise<{ sessao: SessaoPayload; barbeariaId: string } | NextResponse> {
  const sessao = await exigirSessao(["ADMIN"]);
  if (sessao instanceof NextResponse) return sessao;

  const barbeariaId = req.nextUrl.searchParams.get("barbeariaId");
  if (!barbeariaId) {
    return NextResponse.json({ erro: "Informe a barbearia (barbeariaId)" }, { status: 400 });
  }
  if (!(await acessoAdminValido(sessao.usuarioId, barbeariaId))) {
    return NextResponse.json({ erro: "Sem acesso a essa barbearia (expirado, revogado, ou nunca concedido)" }, { status: 403 });
  }
  return { sessao, barbeariaId };
}
