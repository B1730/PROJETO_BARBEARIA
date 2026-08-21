"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Cabecalho from "@/components/Cabecalho";

type AcessoBarbearia = {
  barbearia: { id: string; nome: string; slug: string };
  expiraEm: string;
  motivo: string | null;
};

// Tela inicial do ADMIN (administrador da plataforma) — separada de /admin
// e /barbeiro de propósito, já que esse papel não gerencia nada, só
// visualiza barbearias às quais um DONO concedeu acesso temporário (regra
// de negócio 14). Lista só o que está ATIVO agora — acesso expirado ou
// revogado simplesmente some daqui.
export default function PainelPlataforma() {
  const [sessao, setSessao] = useState<{ papel: string } | null | undefined>(undefined);
  const [acessos, setAcessos] = useState<AcessoBarbearia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [sResp, aResp] = await Promise.all([fetch("/api/auth/sessao"), fetch("/api/admin/barbearias")]);
        if (!sResp.ok) { setSessao(null); setCarregando(false); return; }
        const s = await sResp.json();
        setSessao(s.usuario);
        if (s.usuario.papel === "ADMIN" && aResp.ok) {
          const a = await aResp.json();
          setAcessos(a.acessos || []);
        }
        setCarregando(false);
      } catch {
        setErroCarregamento("Não foi possível conectar. Tente recarregar a página.");
        setCarregando(false);
      }
    })();
  }, []);

  if (carregando) {
    return (
      <>
        <Cabecalho />
        <main className="max-w-2xl mx-auto px-6 py-14 text-ink/60">Carregando...</main>
      </>
    );
  }

  if (erroCarregamento) {
    return (
      <>
        <Cabecalho />
        <main className="max-w-2xl mx-auto px-6 py-14">
          <p className="text-sm text-red-600">{erroCarregamento}</p>
        </main>
      </>
    );
  }

  if (!sessao || sessao.papel !== "ADMIN") {
    return (
      <>
        <Cabecalho />
        <main className="max-w-2xl mx-auto px-6 py-14">
          <p className="text-ink/70">
            Essa área é só para administradores da plataforma.{" "}
            <a className="underline" href="/entrar?next=/plataforma">Entrar</a>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <Cabecalho />
      <main className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="font-display text-3xl mb-2">Barbearias</h1>
        <p className="text-sm text-ink/50 mb-6">
          Você só vê aqui as barbearias com acesso ativo agora — concedido pelo próprio dono, sempre temporário e
          somente leitura.
        </p>

        {acessos.length === 0 && <p className="text-sm text-ink/50">Nenhum acesso ativo no momento.</p>}

        <div className="space-y-2">
          {acessos.map((a) => (
            <Link key={a.barbearia.id} href={`/plataforma/${a.barbearia.id}`} className="card block hover:border-accent">
              <p className="font-medium">{a.barbearia.nome}</p>
              <p className="text-sm text-ink/60">
                Expira {new Date(a.expiraEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
              {a.motivo && <p className="text-xs text-ink/50 mt-1">Motivo: {a.motivo}</p>}
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
