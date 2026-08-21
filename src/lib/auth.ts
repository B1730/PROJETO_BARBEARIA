import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

// Sem fallback de propósito: assinar sessão com uma string previsível do
// código-fonte permitiria forjar login como qualquer usuário/barbearia.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET não está definida — configure essa variável de ambiente antes de rodar o app.");
}
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = "sessao";

export type SessaoPayload = {
  usuarioId: string;
  papel: "CLIENTE" | "BARBEIRO" | "DONO" | "ADMIN";
  barbeariaId: string | null;
};

// Aplicar em toda leitura E escrita de e-mail (login, cadastro, convite de
// barbeiro, callback do Google, etc.) — sem isso, "Fulano@x.com" e
// "fulano@x.com" viram duas contas diferentes (o @unique do schema compara
// bytes crus, não é case-insensitive), e um cliente cujo teclado
// auto-capitalizou o e-mail no login não encontra a própria conta.
export function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function criarHashSenha(senha: string) {
  return bcrypt.hash(senha, 10);
}

export async function conferirSenha(senha: string, hash: string) {
  return bcrypt.compare(senha, hash);
}

export async function criarSessao(payload: SessaoPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function pegarSessao(): Promise<SessaoPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessaoPayload;
  } catch {
    return null;
  }
}

export function encerrarSessao() {
  cookies().delete(COOKIE_NAME);
}

// "vinculo" amarra esse token a um cookie httpOnly separado gravado no
// mesmo momento (ver google/callback) — sem isso, o token sozinho seria um
// bearer credential completo bastando vazar a URL (histórico do navegador,
// log de proxy) pra alguém completar o cadastro no lugar da pessoa dona do
// e-mail, dentro da janela de 10min. "intent" vem sempre do callback (nunca
// do cliente) — decide, em /api/auth/google/finalizar, se falta o nome da
// barbearia (DONO) ou o WhatsApp (CLIENTE, ver regra de negócio 12).
export type IdentidadeGooglePendente = { email: string; nome: string; vinculo: string; intent: "CLIENTE" | "DONO" };

// Usado só no fluxo "cadastrar barbearia com Google": depois que o Google
// confirma quem é a pessoa mas antes de saber o nome da barbearia, guardamos
// nome+e-mail nesse token assinado (curto, 10min) — assinado pra ninguém
// conseguir forjar um e-mail que não confirmou de verdade no Google.
export async function criarTokenGooglePendente(identidade: IdentidadeGooglePendente) {
  return new SignJWT(identidade)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(SECRET);
}

export async function lerTokenGooglePendente(token: string): Promise<IdentidadeGooglePendente | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as IdentidadeGooglePendente;
  } catch {
    return null;
  }
}

// Mesmo padrão do convite pendente do Google, usado no convite de
// barbeiro por e-mail: nenhuma linha é criada em Usuario até o convidado
// clicar no link e escolher a própria senha (ver
// src/app/api/barbeiros/aceitar-convite/route.ts). Validade de 3 dias —
// mais longa que o convite do Google porque depende da pessoa checar o
// e-mail, não é um redirect imediato de navegador.
export type IdentidadeConviteBarbeiro = { email: string; nome: string; barbeariaId: string; convidadoPor: string };

export async function criarTokenConviteBarbeiro(identidade: IdentidadeConviteBarbeiro) {
  return new SignJWT(identidade)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("3d")
    .sign(SECRET);
}

export async function lerTokenConviteBarbeiro(token: string): Promise<IdentidadeConviteBarbeiro | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as IdentidadeConviteBarbeiro;
  } catch {
    return null;
  }
}

// "Link de acompanhamento" de um agendamento — pro CLIENTE convidado (sem
// conta, ver regra de negócio 15) conseguir ver o status e cancelar depois,
// sem precisar de login. Prova posse só desse UM agendamento (não é um
// bearer credential geral tipo os tokens acima, que provam uma identidade
// inteira) — por isso não precisa do mesmo vínculo por cookie que o
// cadastro com Google usa; o pior caso de vazamento é alguém ver/cancelar
// esse agendamento específico, não assumir uma conta. Validade generosa
// (180 dias) porque não existe outro jeito de o cliente reencontrar isso —
// não há e-mail nem SMS nesse app, o link é a única cópia.
export type IdentidadeAgendamentoConvidado = { agendamentoId: string };

export async function criarTokenAgendamentoConvidado(identidade: IdentidadeAgendamentoConvidado) {
  return new SignJWT(identidade)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(SECRET);
}

export async function lerTokenAgendamentoConvidado(token: string): Promise<IdentidadeAgendamentoConvidado | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as IdentidadeAgendamentoConvidado;
  } catch {
    return null;
  }
}
