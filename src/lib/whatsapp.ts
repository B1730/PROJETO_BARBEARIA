// Notificação de novo agendamento via CallMeBot
// (https://www.callmebot.com/blog/free-api-whatsapp-messages/) — API gratuita
// e não-oficial (não é a API oficial da Meta). Cada barbeiro precisa ativar
// o próprio número mandando a mensagem "I allow callmebot to send me
// messages" para o contato do CallMeBot no WhatsApp e guardar a apikey que
// ele responde (feito na tela /barbeiro/perfil). Por ser não-oficial, pode
// parar de funcionar sem aviso — por isso o envio nunca deve derrubar a
// criação do agendamento, só falhar em silêncio (logado no servidor).
export async function notificarNovoAgendamento(params: {
  whatsapp: string;
  apikey: string;
  mensagem: string;
}) {
  const { whatsapp, apikey, mensagem } = params;
  const numero = whatsapp.replace(/\D/g, "");
  if (!numero || !apikey) return;

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(numero)}&text=${encodeURIComponent(mensagem)}&apikey=${encodeURIComponent(apikey)}`;

  try {
    await fetch(url);
  } catch (erro) {
    console.error("Falha ao enviar notificação de WhatsApp:", erro);
  }
}
