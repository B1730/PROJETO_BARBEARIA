// Envio de e-mail transacional (hoje só usado pro convite de barbeiro) via
// Resend (resend.com) — API HTTP direta com fetch(), sem instalar o SDK
// deles como dependência nova, seguindo o mesmo padrão que o resto do
// projeto usa pra serviço externo (CallMeBot em src/lib/whatsapp.ts,
// Supabase Storage em src/lib/storage.ts).
//
// Remetente de sandbox da própria Resend — funciona sem verificar domínio
// próprio. Depois de verificar um domínio na conta Resend, dá pra trocar
// essa constante por um e-mail desse domínio (ex: convites@suabarbearia.com).
const REMETENTE = "Barbershop SaaS <onboarding@resend.dev>";

// Ao contrário de notificarNovoAgendamento() (que falha em silêncio de
// propósito, por cima de um agendamento que já foi criado), aqui o e-mail
// é o ÚNICO jeito da pessoa convidada completar o cadastro — uma falha
// precisa subir como erro de verdade pra quem convidou saber e tentar de
// novo, em vez de achar que o convite foi enviado.
export async function enviarEmailConvite(params: {
  para: string;
  nome: string;
  barbeariaNome: string;
  convidadoPorNome: string;
  link: string;
}): Promise<void> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    throw new Error("Envio de e-mail não está configurado (falta RESEND_API_KEY)");
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: REMETENTE,
      to: params.para,
      subject: `Convite para ${params.barbeariaNome}`,
      html: `
        <p>Olá, ${params.nome}!</p>
        <p><strong>${params.convidadoPorNome}</strong> te convidou pra ser barbeiro em
        <strong>${params.barbeariaNome}</strong>.</p>
        <p>Clique no link abaixo pra confirmar seu e-mail e criar sua senha:</p>
        <p><a href="${params.link}">${params.link}</a></p>
        <p>Esse link vale por 3 dias.</p>
      `,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Falha ao enviar e-mail de convite (${resp.status}): ${await resp.text()}`);
  }
}
