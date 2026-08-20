"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Cabecalho from "@/components/Cabecalho";

export default function PerfilBarbeiro() {
  const [whatsapp, setWhatsapp] = useState("");
  const [callmebotApiKey, setCallmebotApiKey] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [novaFoto, setNovaFoto] = useState<File | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    fetch("/api/perfil")
      .then((r) => r.json())
      .then((d) => {
        setWhatsapp(d.usuario?.whatsapp || "");
        setCallmebotApiKey(d.usuario?.callmebotApiKey || "");
        setFotoUrl(d.usuario?.fotoUrl || "");
        setCarregando(false);
      });
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setSalvando(true);

    let novaFotoUrl = fotoUrl;
    if (novaFoto) {
      const form = new FormData();
      form.append("arquivo", novaFoto);
      form.append("pasta", "barbeiros");
      const respUpload = await fetch("/api/upload", { method: "POST", body: form });
      const dadosUpload = await respUpload.json();
      if (!respUpload.ok) {
        setSalvando(false);
        setErro(dadosUpload.erro || "Não foi possível enviar a foto");
        return;
      }
      novaFotoUrl = dadosUpload.url;
    }

    const resp = await fetch("/api/perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsapp, callmebotApiKey, fotoUrl: novaFotoUrl }),
    });
    setSalvando(false);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      setErro(dados.erro || "Não foi possível salvar");
      return;
    }
    setFotoUrl(novaFotoUrl);
    setNovaFoto(null);
    setSucesso("Salvo!");
  }

  return (
    <>
      <Cabecalho />
      <main className="max-w-sm mx-auto px-6 py-14 space-y-6">
        <div>
          <Link href="/barbeiro" className="text-sm text-ink/60 hover:text-ink">← Voltar</Link>
          <h1 className="font-display text-2xl mt-2">Meu perfil</h1>
        </div>

        <div className="card text-sm text-ink/70 space-y-2">
          <p className="font-medium text-ink">Como ativar as notificações</p>
          <p>
            1. Salve o número <strong>+34 644 59 71 92</strong> nos seus contatos do WhatsApp.
          </p>
          <p>
            2. Mande pra ele a mensagem: <strong>I allow callmebot to send me messages</strong>
          </p>
          <p>
            3. Ele responde com sua chave (apikey) pessoal — cole ela abaixo, junto com o seu número.
          </p>
        </div>

        {carregando ? (
          <p className="text-sm text-ink/50">Carregando...</p>
        ) : (
          <form onSubmit={salvar} className="space-y-4">
            <div className="flex items-center gap-4">
              {fotoUrl && (
                <Image src={fotoUrl} alt="Sua foto" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
              )}
              <div className="flex-1">
                <label className="text-sm text-ink/60 mb-1 block">Foto de perfil (opcional)</label>
                <input
                  className="input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setNovaFoto(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-ink/60 mb-1 block">Seu WhatsApp (com DDD e país, só números)</label>
              <input
                className="input"
                placeholder="5511999999999"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-ink/60 mb-1 block">Apikey do CallMeBot</label>
              <input
                className="input"
                placeholder="123456"
                value={callmebotApiKey}
                onChange={(e) => setCallmebotApiKey(e.target.value)}
              />
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            {sucesso && <p className="text-sm text-green-600">{sucesso}</p>}
            <button className="btn-primary w-full" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
