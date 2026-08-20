// Notificação via CallMeBot
// (https://www.callmebot.com/blog/free-api-whatsapp-messages/) — API gratuita
// e não-oficial (não é a API oficial da Meta). Cada barbeiro precisa ativar
// o próprio número mandando a mensagem "I allow callmebot to send me
// messages" para o contato do CallMeBot no WhatsApp e guardar a apikey que
// ele responde (feito na tela /barbeiro/perfil). Por ser não-oficial, pode
// parar de funcionar sem aviso — por isso o envio nunca deve derrubar a
// ação que disparou a notificação, só falhar em silêncio (logado no servidor).
async function enviarWhatsapp(whatsapp: string, apikey: string, mensagem: string) {
  const numero = whatsapp.replace(/\D/g, "");
  if (!numero || !apikey) return;

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(numero)}&text=${encodeURIComponent(mensagem)}&apikey=${encodeURIComponent(apikey)}`;

  try {
    // Timeout curto: essa chamada é aguardada antes de responder a
    // requisição que a disparou — sem limite, uma API do CallMeBot lenta ou
    // travada atrasaria (ou, num serverless com limite de duração, poderia
    // até derrubar) a resposta inteira.
    await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch (erro) {
    console.error("Falha ao enviar notificação de WhatsApp:", erro);
  }
}

export async function notificarNovoAgendamento(params: { whatsapp: string; apikey: string; mensagem: string }) {
  await enviarWhatsapp(params.whatsapp, params.apikey, params.mensagem);
}

// Cliente pediu pra cancelar — manda pro barbeiro ANTES do agendamento
// virar CANCELADO de fato, pra ele ter chance de falar com o cliente e
// entender o motivo antes de decidir (ver POST /api/agendamentos/[id]/cancelar).
export async function notificarSolicitacaoCancelamento(params: { whatsapp: string; apikey: string; mensagem: string }) {
  await enviarWhatsapp(params.whatsapp, params.apikey, params.mensagem);
}

// Confirmação final pro barbeiro depois que o agendamento realmente vira
// CANCELADO (ver PATCH /api/agendamentos/[id]).
export async function notificarCancelamentoConfirmado(params: { whatsapp: string; apikey: string; mensagem: string }) {
  await enviarWhatsapp(params.whatsapp, params.apikey, params.mensagem);
}
