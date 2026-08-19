import nodemailer from "nodemailer";

// Envio de e-mail (convite de barbeiro + boas-vindas depois que ele aceita)
// via Gmail (SMTP, com "senha de app" — precisa de verificação em duas
// etapas ativada na conta). Escolhido no lugar da Resend porque, sem
// verificar um domínio próprio, a Resend só deixa mandar e-mail pro e-mail
// da própria conta — inviabiliza convidar qualquer barbeiro de verdade.
// Diferente do resto do projeto (CallMeBot, Supabase Storage), aqui não dá
// pra usar só fetch() — SMTP é um protocolo com estado, precisa de uma
// biblioteca (nodemailer).
let transportador: ReturnType<typeof nodemailer.createTransport> | null = null;

function pegarTransportador() {
  const usuario = process.env.GMAIL_USER;
  const senha = process.env.GMAIL_APP_PASSWORD;
  if (!usuario || !senha) {
    throw new Error("Envio de e-mail não está configurado (faltam GMAIL_USER/GMAIL_APP_PASSWORD)");
  }
  if (!transportador) {
    transportador = nodemailer.createTransport({
      service: "gmail",
      auth: { user: usuario, pass: senha },
    });
  }
  return transportador;
}

// Ao contrário de notificarNovoAgendamento() (que falha em silêncio de
// propósito, por cima de um agendamento que já foi criado), aqui o e-mail
// é o ÚNICO jeito da pessoa convidada completar o cadastro — uma falha
// precisa subir um erro de verdade, porque quem convidou precisa saber e
// tentar de novo.
export async function enviarEmailConvite(params: {
  para: string;
  nome: string;
  barbeariaNome: string;
  convidadoPorNome: string;
  link: string;
}): Promise<void> {
  const transportador = pegarTransportador();
  await transportador.sendMail({
    from: `"${params.barbeariaNome}" <${process.env.GMAIL_USER}>`,
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
  });
}

// Disparado depois que o convite é aceito (conta já criada e a pessoa já
// logada) — falha em silêncio de propósito, igual notificarNovoAgendamento:
// é só um "boas-vindas" a mais, não pode derrubar o cadastro que já deu
// certo.
export async function enviarEmailBoasVindas(params: {
  para: string;
  nome: string;
  barbeariaNome: string;
  urlLogin: string;
  urlBarbearia: string;
}): Promise<void> {
  try {
    const transportador = pegarTransportador();
    await transportador.sendMail({
      from: `"${params.barbeariaNome}" <${process.env.GMAIL_USER}>`,
      to: params.para,
      subject: `Bem-vindo(a) à ${params.barbeariaNome}!`,
      html: `
        <p>Olá, ${params.nome}!</p>
        <p>Seu cadastro em <strong>${params.barbeariaNome}</strong> foi confirmado.</p>
        <p>Pra acessar seu painel quando quiser (agenda, horários, cortes), use:
        <a href="${params.urlLogin}">${params.urlLogin}</a></p>
        <p>E esse é o link que seus clientes usam pra agendar horário com você:
        <a href="${params.urlBarbearia}">${params.urlBarbearia}</a></p>
      `,
    });
  } catch (erro) {
    console.error("Falha ao enviar e-mail de boas-vindas:", erro);
  }
}
