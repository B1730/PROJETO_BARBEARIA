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
  const intent = searchParams.get("intent") === "CLIENTE" ? "CLIENTE" : "DONO";
  const nextBruto = searchParams.get("next");
  const next = nextBruto && /^\/(?!\/|\\)/.test(nextBruto) ? nextBruto : null;

  const [nomeBarbearia, setNomeBarbearia] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function finalizar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const resp = await fetch("/api/auth/google/finalizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          nomeBarbearia: intent === "DONO" ? nomeBarbearia : undefined,
          whatsapp: intent === "CLIENTE" ? whatsapp : undefined,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setCarregando(false);
        setErro(dados.erro || "Não foi possível concluir o cadastro");
        return;
      }
      router.push(intent === "DONO" ? "/admin" : next || "/");
    } catch {
      setCarregando(false);
      setErro("Não foi possível conectar. Tente novamente.");
    }
  }

  if (!token) {
    return (
      <main className="max-w-sm mx-auto px-6 py-20">
        <p className="text-sm text-red-600 mb-4">
          Link inválido. Volte pra tela de entrar e tente "Entrar com Google" de novo.
        </p>
        <a className="underline text-sm" href="/entrar">← Voltar pra Entrar</a>
      </main>
    );
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-20">
      <h1 className="font-display text-2xl mb-2">Falta só um detalhe</h1>
      <p className="text-sm text-ink/60 mb-6">
        {intent === "DONO"
          ? "Sua conta do Google foi confirmada — agora só o nome da sua barbearia."
          : "Sua conta do Google foi confirmada — agora só o seu WhatsApp, pra o barbeiro poder entrar em contato se precisar."}
      </p>
      <form onSubmit={finalizar} className="space-y-4">
        {intent === "DONO" ? (
          <div>
            <label className="text-sm text-ink/60 mb-1 block" htmlFor="nomeBarbearia">Nome da barbearia</label>
            <input
              id="nomeBarbearia"
              className="input"
              placeholder="Nome da barbearia"
              value={nomeBarbearia}
              onChange={(e) => { setNomeBarbearia(e.target.value); setErro(""); }}
              required
              autoFocus
            />
          </div>
        ) : (
          <div>
            <label className="text-sm text-ink/60 mb-1 block" htmlFor="whatsapp">Seu WhatsApp</label>
            <input
              id="whatsapp"
              className="input"
              placeholder="Seu WhatsApp (com DDD e país)"
              value={whatsapp}
              onChange={(e) => { setWhatsapp(e.target.value); setErro(""); }}
              required
              autoFocus
            />
          </div>
        )}
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button className="btn-primary w-full" disabled={carregando}>
          {carregando ? "Criando..." : intent === "DONO" ? "Criar barbearia" : "Criar conta"}
        </button>
      </form>
    </main>
  );
}
