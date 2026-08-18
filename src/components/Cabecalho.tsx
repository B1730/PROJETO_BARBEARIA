"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Sessao = {
  usuario: { id: string; nome: string; papel: "CLIENTE" | "BARBEIRO" | "DONO" };
  barbearia: { id: string; nome: string } | null;
};

// Cabeçalho compartilhado dos painéis logados (barbeiro/dono). Consulta a
// própria sessão ao montar — assim a interface reflete que o usuário
// continua logado entre visitas, em vez de simplesmente não mostrar nada.
export default function Cabecalho() {
  const router = useRouter();
  const [sessao, setSessao] = useState<Sessao | null>(null);

  useEffect(() => {
    fetch("/api/auth/sessao").then(async (r) => {
      if (!r.ok) {
        router.push("/entrar");
        return;
      }
      setSessao(await r.json());
    });
  }, [router]);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/entrar");
  }

  return (
    <header className="border-b border-line bg-white">
      <div className="max-w-2xl mx-auto px-6 py-4 flex justify-between items-center">
        <div>
          <p className="font-medium">{sessao?.barbearia?.nome ?? " "}</p>
          <p className="text-sm text-ink/60">{sessao?.usuario.nome ?? " "}</p>
        </div>
        <div className="flex items-center gap-4">
          {sessao?.usuario.papel === "BARBEIRO" && (
            <Link href="/barbeiro/perfil" className="text-sm text-ink/60 hover:text-ink">
              Meu perfil
            </Link>
          )}
          <button onClick={sair} className="text-sm text-ink/60 hover:text-ink">
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
