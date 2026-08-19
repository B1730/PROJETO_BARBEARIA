"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function Entrar() {
  return (
    <Suspense fallback={null}>
      <FormularioEntrar />
    </Suspense>
  );
}

function FormularioEntrar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const erroGoogle = searchParams.get("erro");

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(erroGoogle || "");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const resp = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });
    const dados = await resp.json();
    setCarregando(false);
    if (!resp.ok) {
      setErro(dados.erro || "Não foi possível entrar");
      return;
    }
    if (dados.usuario.papel === "DONO") router.push("/admin");
    else if (dados.usuario.papel === "BARBEIRO") router.push("/barbeiro");
    else router.push(next && next.startsWith("/") ? next : "/");
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-20">
      <h1 className="font-display text-2xl mb-6">Entrar</h1>

      <a
        href={`/api/auth/google?modo=entrar${next ? `&next=${encodeURIComponent(next)}` : ""}`}
        className="btn-secondary w-full flex items-center justify-center gap-2 mb-4"
      >
        Entrar com Google
      </a>
      <p className="text-xs text-ink/40 text-center mb-6">
        (só funciona se você já tem conta — pra criar uma conta nova, use a
        tela de cadastro)
      </p>

      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink/40">ou com e-mail</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={entrar} className="space-y-4">
        <input
          className="input"
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button className="btn-primary w-full" disabled={carregando}>
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p className="text-sm text-ink/60 text-center mt-6">
        Não tem conta?{" "}
        <a className="underline" href="/cadastro">Cadastre-se</a>
      </p>
    </main>
  );
}
