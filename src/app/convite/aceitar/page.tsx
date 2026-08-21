"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AceitarConvite() {
  return (
    <Suspense fallback={null}>
      <FormularioAceitarConvite />
    </Suspense>
  );
}

type Convite = { nome: string; email: string; barbeariaNome: string; convidadoPorNome: string };

function FormularioAceitarConvite() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [convite, setConvite] = useState<Convite | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroConvite, setErroConvite] = useState("");
  const [sessaoAtual, setSessaoAtual] = useState<{ nome: string } | null>(null);

  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) {
      setErroConvite("Link inválido. Peça pra te convidarem de novo.");
      setCarregando(false);
      return;
    }
    fetch(`/api/barbeiros/aceitar-convite?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const dados = await r.json();
        if (!r.ok) {
          setErroConvite(dados.erro || "Não foi possível carregar esse convite");
        } else {
          setConvite(dados);
        }
        setCarregando(false);
      })
      .catch(() => {
        setErroConvite("Não foi possível conectar. Tente recarregar a página.");
        setCarregando(false);
      });
    // Se o navegador já tiver uma sessão logada, avisa antes de deixar
    // continuar — confirmar o convite troca pra essa conta nova sem
    // perguntar, e sem esse aviso a pessoa não teria como saber disso.
    fetch("/api/auth/sessao")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.usuario) setSessaoAtual({ nome: d.usuario.nome }); })
      .catch(() => {});
  }, [token]);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (senha !== confirmarSenha) {
      setErro("As senhas não são iguais");
      return;
    }
    setEnviando(true);
    try {
      const resp = await fetch("/api/barbeiros/aceitar-convite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, senha }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setEnviando(false);
        setErro(dados.erro || "Não foi possível confirmar o convite");
        return;
      }
      router.push("/barbeiro");
    } catch {
      setEnviando(false);
      setErro("Não foi possível conectar. Tente novamente.");
    }
  }

  if (carregando) {
    return <main className="max-w-sm mx-auto px-6 py-20 text-ink/60">Carregando...</main>;
  }

  if (erroConvite) {
    return (
      <main className="max-w-sm mx-auto px-6 py-20">
        <p className="text-sm text-red-600 mb-4">{erroConvite}</p>
        <a className="underline text-sm" href="/entrar">← Voltar pra Entrar</a>
      </main>
    );
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-20">
      <h1 className="font-display text-2xl mb-2">Confirme seu cadastro</h1>
      <p className="text-sm text-ink/60 mb-6">
        <strong>{convite?.convidadoPorNome}</strong> te convidou pra ser barbeiro em{" "}
        <strong>{convite?.barbeariaNome}</strong>.
      </p>
      <div className="card text-sm text-ink/70 mb-6">
        <p><strong>Nome:</strong> {convite?.nome}</p>
        <p><strong>E-mail:</strong> {convite?.email}</p>
      </div>
      {sessaoAtual && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 mb-6">
          Você está logado como <strong>{sessaoAtual.nome}</strong> nesse navegador. Confirmar esse
          convite vai trocar pra essa conta nova de barbeiro.
        </p>
      )}
      <form onSubmit={confirmar} className="space-y-4">
        <div>
          <label className="text-sm text-ink/60 mb-1 block" htmlFor="senha">Crie uma senha</label>
          <input
            id="senha"
            className="input"
            type="password"
            placeholder="Crie uma senha"
            value={senha}
            onChange={(e) => { setSenha(e.target.value); setErro(""); }}
            required
            minLength={6}
          />
        </div>
        <div>
          <label className="text-sm text-ink/60 mb-1 block" htmlFor="confirmarSenha">Confirme a senha</label>
          <input
            id="confirmarSenha"
            className="input"
            type="password"
            placeholder="Confirme a senha"
            value={confirmarSenha}
            onChange={(e) => { setConfirmarSenha(e.target.value); setErro(""); }}
            required
            minLength={6}
          />
        </div>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button className="btn-primary w-full" disabled={enviando}>
          {enviando ? "Confirmando..." : "Confirmar e entrar"}
        </button>
      </form>
    </main>
  );
}
