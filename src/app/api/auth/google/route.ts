import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

const COOKIE_ESTADO = "google_oauth_estado";

// GET /api/auth/google?next=/barbearia-do-ze
// GET /api/auth/google?intent=DONO
// Início do login social. Dois usos:
// - intent=CLIENTE (padrão): login/cadastro direto de cliente, sem dado extra.
// - intent=DONO: cadastro de barbearia — como o Google não devolve o nome da
//   barbearia, se a conta ainda não existir o callback manda pra uma tela
//   extra pedindo só esse campo (ver /api/auth/google/callback).
// BARBEIRO não usa esse fluxo — precisa de um convite/id de barbearia que o
// Google não tem como fornecer.
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ erro: "Login com Google não está configurado" }, { status: 500 });
  }

  const intentBruto = req.nextUrl.searchParams.get("intent");
  const intent = intentBruto === "DONO" ? "DONO" : "CLIENTE";

  // Bloqueia não só "//evil.com" mas também "/\evil.com" — alguns
  // navegadores normalizam barra invertida logo após a primeira barra pra
  // fora do domínio na hora de redirecionar, então startsWith("//") sozinho
  // não fecha esse caminho de open-redirect.
  const next = req.nextUrl.searchParams.get("next");
  const proximaRota = next && /^\/(?!\/|\\)/.test(next) ? next : "/";

  const estado = randomUUID();
  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", estado);

  const resposta = NextResponse.redirect(url);
  resposta.cookies.set(COOKIE_ESTADO, JSON.stringify({ estado, next: proximaRota, intent }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 5,
    path: "/api/auth/google",
  });
  return resposta;
}
