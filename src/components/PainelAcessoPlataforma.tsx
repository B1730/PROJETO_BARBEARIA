"use client";

import { useEffect, useState } from "react";

type AcessoAdmin = {
  id: string;
  motivo: string | null;
  concedidoEm: string;
  expiraEm: string;
  revogadoEm: string | null;
  usuario: { nome: string; email: string };
};

function statusDe(a: AcessoAdmin): "Ativo" | "Expirado" | "Revogado" {
  if (a.revogadoEm) return "Revogado";
  if (new Date(a.expiraEm) <= new Date()) return "Expirado";
  return "Ativo";
}

function corDoStatus(status: string) {
  if (status === "Ativo") return "text-green-700";
  if (status === "Expirado") return "text-ink/50";
  return "text-red-600";
}

// Seção do painel do dono pra conceder e acompanhar acessos temporários e
// somente-leitura de administradores da plataforma (regra de negócio 14).
// Autocontido de propósito — não compartilha estado com o resto de
// admin/page.tsx, então busca a própria lista e cuida do próprio
// erro/sucesso, sem precisar de props.
export default function PainelAcessoPlataforma() {
  const [acessos, setAcessos] = useState<AcessoAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [email, setEmail] = useState("");
  const [duracaoDias, setDuracaoDias] = useState("3");
  const [motivo, setMotivo] = useState("");
  const [concedendo, setConcedendo] = useState(false);
  const [revogandoId, setRevogandoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  async function carregar() {
    const resp = await fetch("/api/acessos-admin");
    if (!resp.ok) {
      setCarregando(false);
      return;
    }
    const dados = await resp.json();
    setAcessos(dados.acessos || []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function conceder(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setConcedendo(true);
    const resp = await fetch("/api/acessos-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, duracaoDias: Number(duracaoDias), motivo }),
    });
    setConcedendo(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível conceder o acesso");
      return;
    }
    setEmail("");
    setDuracaoDias("3");
    setMotivo("");
    setSucesso("Acesso concedido.");
    carregar();
  }

  async function revogar(id: string) {
    if (!window.confirm("Revogar esse acesso agora? O administrador perde a visualização imediatamente.")) return;
    setErro("");
    setSucesso("");
    setRevogandoId(id);
    const resp = await fetch(`/api/acessos-admin/${id}`, { method: "PATCH" });
    setRevogandoId(null);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível revogar");
      return;
    }
    setSucesso("Acesso revogado.");
    carregar();
  }

  return (
    <section>
      <h2 className="font-medium mb-3">Acesso da plataforma</h2>
      <p className="text-sm text-ink/50 mb-3">
        Conceda acesso temporário e somente leitura a um administrador da plataforma — ele vê agendamentos,
        faturamento, barbeiros e cortes desta barbearia, mas nunca pode alterar nada. O acesso expira sozinho
        no prazo escolhido, ou você pode revogar antes.
      </p>

      <form onSubmit={conceder} className="card space-y-3 mb-4">
        <div>
          <label className="text-sm text-ink/60 mb-1 block" htmlFor="emailAdmin">E-mail do administrador</label>
          <input
            id="emailAdmin"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-ink/60 mb-1 block" htmlFor="duracaoDias">Duração (dias)</label>
            <input
              id="duracaoDias"
              className="input"
              type="number"
              min={1}
              max={90}
              required
              value={duracaoDias}
              onChange={(e) => setDuracaoDias(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-ink/60 mb-1 block" htmlFor="motivoAcesso">Motivo (opcional)</label>
            <input
              id="motivoAcesso"
              className="input"
              placeholder="ex: suporte técnico"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {sucesso && <p className="text-sm text-green-600">{sucesso}</p>}
        <button className="btn-primary" disabled={concedendo}>
          {concedendo ? "Concedendo..." : "Conceder acesso"}
        </button>
      </form>

      {carregando ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : acessos.length === 0 ? (
        <p className="text-sm text-ink/50">Nenhum acesso concedido ainda.</p>
      ) : (
        <div className="space-y-2">
          {acessos.map((a) => {
            const status = statusDe(a);
            return (
              <div key={a.id} className="card flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{a.usuario.nome} <span className="text-ink/50 font-normal">({a.usuario.email})</span></p>
                  <p className={`text-sm ${corDoStatus(status)}`}>{status}</p>
                  <p className="text-xs text-ink/50 mt-1">
                    Concedido {new Date(a.concedidoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    {" · "}
                    {status === "Revogado" && a.revogadoEm
                      ? `revogado ${new Date(a.revogadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                      : `expira ${new Date(a.expiraEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`}
                  </p>
                  {a.motivo && <p className="text-xs text-ink/50">Motivo: {a.motivo}</p>}
                </div>
                {status === "Ativo" && (
                  <button
                    className="text-sm text-red-600 hover:text-red-700 shrink-0"
                    disabled={revogandoId === a.id}
                    onClick={() => revogar(a.id)}
                  >
                    {revogandoId === a.id ? "Revogando..." : "Revogar"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
