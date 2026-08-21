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
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    fetch("/api/auth/sessao")
      .then(async (r) => {
        // Só 401 de verdade (sessão ausente/inválida) manda pro login — um
        // erro transitório (500 por soluço de conexão, por exemplo) não
        // pode deslogar quem tem um cookie perfeitamente válido. Mesmo
        // padrão já usado em barbeiro/page.tsx, admin/page.tsx e
        // barbeiro/desempenho/page.tsx (só esse arquivo usava !r.ok).
        if (r.status === 401) {
          router.push("/entrar");
          return;
        }
        if (!r.ok) return;
        setSessao(await r.json());
      })
      .catch(() => {});
  }, [router]);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/entrar");
    } catch {
      setSaindo(false);
    }
  }

  return (
    <header className="border-b border-line bg-white">
      <div className="max-w-2xl mx-auto px-6 py-4 flex flex-wrap justify-between items-center gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{sessao?.barbearia?.nome ?? " "}</p>
          <p className="text-sm text-ink/60 truncate">{sessao?.usuario.nome ?? " "}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sessao?.usuario.papel === "BARBEIRO" && (
            <Link href="/barbeiro/perfil" className="text-sm text-ink/60 hover:text-ink py-2 px-1">
              Meu perfil
            </Link>
          )}
          <button onClick={sair} disabled={saindo} className="text-sm text-ink/60 hover:text-ink py-2 px-1 disabled:opacity-50 disabled:cursor-not-allowed">
            {saindo ? "Saindo..." : "Sair"}
          </button>
        </div>
      </div>
    </header>
  );
}
