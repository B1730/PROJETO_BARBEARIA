"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// useSearchParams() precisa estar dentro de um Suspense pra não quebrar o
// build de produção (o next dev deixa passar sem isso, mas o build real não).
export default function Cadastro() {
  return (
    <Suspense fallback={null}>
      <FormularioCadastro />
    </Suspense>
  );
}

function FormularioCadastro() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const papel = searchParams.get("papel") === "CLIENTE" ? "CLIENTE" : "DONO";

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nomeBarbearia, setNomeBarbearia] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const resp = await fetch("/api/auth/cadastro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha, papel, nomeBarbearia: papel === "DONO" ? nomeBarbearia : undefined }),
    });
    const dados = await resp.json();
    setCarregando(false);
    if (!resp.ok) {
      setErro(dados.erro || "Não foi possível cadastrar");
      return;
    }
    router.push(papel === "DONO" ? "/admin" : "/");
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-20">
      <h1 className="font-display text-2xl mb-2">{papel === "DONO" ? "Cadastrar barbearia" : "Criar sua conta"}</h1>
      <p className="text-sm text-ink/60 mb-6">
        {papel === "DONO"
          ? "Você vira o dono/administrador — depois adiciona barbeiros por dentro do painel."
          : "Com sua conta você consegue solicitar agendamentos nas barbearias."}
      </p>
      {papel === "DONO" && (
        <>
          <a href="/api/auth/google?intent=DONO" className="btn-secondary w-full flex items-center justify-center gap-2 mb-6">
            Cadastrar com Google
          </a>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 bg-line" />
            <span className="text-xs text-ink/40">ou preencha os dados</span>
            <div className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <form onSubmit={cadastrar} className="space-y-4">
        {papel === "DONO" && (
          <input className="input" placeholder="Nome da barbearia" value={nomeBarbearia} onChange={(e) => setNomeBarbearia(e.target.value)} required />
        )}
        <input className="input" placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <input className="input" type="email" placeholder="Seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Crie uma senha" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button className="btn-primary w-full" disabled={carregando}>
          {carregando ? "Criando..." : papel === "DONO" ? "Criar barbearia" : "Criar conta"}
        </button>
      </form>

      <p className="text-sm text-ink/60 text-center mt-6">
        Já tem conta?{" "}
        <a className="underline" href="/entrar">Entrar</a>
      </p>
    </main>
  );
}
