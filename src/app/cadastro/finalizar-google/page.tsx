"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function FinalizarCadastroGoogle() {
  return (
    <Suspense fallback={null}>
      <FormularioFinalizar />
    </Suspense>
  );
}

function FormularioFinalizar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [nomeBarbearia, setNomeBarbearia] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function finalizar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const resp = await fetch("/api/auth/google/finalizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, nomeBarbearia }),
    });
    const dados = await resp.json();
    setCarregando(false);
    if (!resp.ok) {
      setErro(dados.erro || "Não foi possível concluir o cadastro");
      return;
    }
    router.push("/admin");
  }

  if (!token) {
    return (
      <main className="max-w-sm mx-auto px-6 py-20">
        <p className="text-sm text-red-600">
          Link inválido. Volte pra tela de entrar e tente "Entrar com Google" de novo.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-20">
      <h1 className="font-display text-2xl mb-2">Falta só um detalhe</h1>
      <p className="text-sm text-ink/60 mb-6">
        Sua conta do Google foi confirmada — agora só o nome da sua barbearia.
      </p>
      <form onSubmit={finalizar} className="space-y-4">
        <input
          className="input"
          placeholder="Nome da barbearia"
          value={nomeBarbearia}
          onChange={(e) => setNomeBarbearia(e.target.value)}
          required
          autoFocus
        />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button className="btn-primary w-full" disabled={carregando}>
          {carregando ? "Criando..." : "Criar barbearia"}
        </button>
      </form>
    </main>
  );
}
