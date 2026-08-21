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
  // Pra quando o cliente clica "criar conta" no meio de um agendamento —
  // sem isso, ele terminava o cadastro e caía na home, perdendo o corte/
  // barbeiro/horário que já tinha escolhido.
  const nextBruto = searchParams.get("next");
  const next = nextBruto && /^\/(?!\/|\\)/.test(nextBruto) ? nextBruto : null;

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nomeBarbearia, setNomeBarbearia] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const resp = await fetch("/api/auth/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome, email, senha, papel,
          nomeBarbearia: papel === "DONO" ? nomeBarbearia : undefined,
          whatsapp: papel === "CLIENTE" ? whatsapp : undefined,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setCarregando(false);
        setErro(dados.erro || "Não foi possível cadastrar");
        return;
      }
      router.push(papel === "DONO" ? "/admin" : next || "/");
    } catch {
      setCarregando(false);
      setErro("Não foi possível conectar. Tente novamente.");
    }
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-20">
      <h1 className="font-display text-2xl mb-2">{papel === "DONO" ? "Cadastrar barbearia" : "Criar sua conta"}</h1>
      <p className="text-sm text-ink/60 mb-2">
        {papel === "DONO"
          ? "Você vira o dono/administrador — depois adiciona barbeiros por dentro do painel."
          : "Com sua conta você consegue solicitar agendamentos nas barbearias."}
      </p>
      <p className="text-sm text-ink/60 mb-6">
        {papel === "DONO" ? (
          <>Só quer agendar um corte?{" "}
            <a className="underline" href={`/cadastro?papel=CLIENTE${next ? `&next=${encodeURIComponent(next)}` : ""}`}>Criar conta de cliente</a>
          </>
        ) : (
          <>Tem uma barbearia?{" "}
            <a className="underline" href={`/cadastro${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Cadastrar minha barbearia</a>
          </>
        )}
      </p>
      <a
        href={`/api/auth/google?intent=${papel}${next ? `&next=${encodeURIComponent(next)}` : ""}`}
        className="btn-secondary w-full flex items-center justify-center gap-2 mb-6"
      >
        Cadastrar com Google
      </a>
      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink/60">ou preencha os dados</span>
        <div className="h-px flex-1 bg-line" />
      </div>
      <form onSubmit={cadastrar} className="space-y-4">
        {papel === "DONO" && (
          <div>
            <label className="text-sm text-ink/60 mb-1 block" htmlFor="nomeBarbearia">Nome da barbearia</label>
            <input id="nomeBarbearia" className="input" placeholder="Nome da barbearia" value={nomeBarbearia} onChange={(e) => { setNomeBarbearia(e.target.value); setErro(""); }} required />
          </div>
        )}
        <div>
          <label className="text-sm text-ink/60 mb-1 block" htmlFor="nome">Seu nome</label>
          <input id="nome" className="input" placeholder="Seu nome" value={nome} onChange={(e) => { setNome(e.target.value); setErro(""); }} required />
        </div>
        <div>
          <label className="text-sm text-ink/60 mb-1 block" htmlFor="email">Seu e-mail</label>
          <input id="email" className="input" type="email" placeholder="Seu e-mail" value={email} onChange={(e) => { setEmail(e.target.value); setErro(""); }} required />
        </div>
        <div>
          <label className="text-sm text-ink/60 mb-1 block" htmlFor="senha">Crie uma senha</label>
          <input id="senha" className="input" type="password" placeholder="Crie uma senha" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(""); }} required minLength={6} />
        </div>
        {papel === "CLIENTE" && (
          <div>
            <label className="text-sm text-ink/60 mb-1 block" htmlFor="whatsapp">Seu WhatsApp (opcional)</label>
            <input
              id="whatsapp"
              className="input"
              placeholder="Seu WhatsApp (opcional, com DDD e país)"
              value={whatsapp}
              onChange={(e) => { setWhatsapp(e.target.value); setErro(""); }}
            />
          </div>
        )}
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button className="btn-primary w-full" disabled={carregando}>
          {carregando ? "Criando..." : papel === "DONO" ? "Criar barbearia" : "Criar conta"}
        </button>
      </form>

      <p className="text-sm text-ink/60 text-center mt-6">
        Já tem conta?{" "}
        <a className="underline" href={`/entrar${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Entrar</a>
      </p>
    </main>
  );
}
