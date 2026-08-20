import { db } from "./db";
import type { Prisma } from "@prisma/client";

// Aceita tanto o cliente Prisma normal quanto um cliente de transação
// (`tx` dentro de `db.$transaction`) — usado pra reconferir o horário
// dentro da mesma transação que cria o agendamento (ver agendamentos/route.ts).
type ClientePrisma = typeof db | Prisma.TransactionClient;

type Ocupado = { inicio: Date; fim: Date };

// Busca os agendamentos que já ocupam a agenda do barbeiro naquele dia e
// devolve os intervalos [início, fim) de cada um. A duração usada é a
// congelada no próprio agendamento (`duracaoMinutos`) quando existir —
// agendamentos criados antes desse campo existir caem no fallback pela
// duração atual do serviço.
export async function buscarAgendamentosOcupados(
  cliente: ClientePrisma,
  params: { barbeiroId: string; data: string }
): Promise<Ocupado[]> {
  const { barbeiroId, data } = params;
  const inicioDoDia = new Date(`${data}T00:00:00-03:00`);
  const fimDoDia = new Date(`${data}T23:59:59-03:00`);
  // Busca também um pouco antes da meia-noite: um agendamento que COMEÇOU
  // no dia anterior (ex: 23:45) pode, dependendo da duração do serviço,
  // continuar ocupando a agenda depois da virada do dia. Sem essa margem,
  // um agendamento assim ficava invisível pra quem consulta o dia seguinte
  // — nem a checagem em memória nem a transação serializable de
  // POST /api/agendamentos pegavam isso, porque a busca por dia nunca
  // trazia essa linha. A janela de disponibilidade de uma barbearia não
  // deveria realisticamente passar de poucas horas, então 6h de margem
  // cobre qualquer serviço com duração razoável.
  const margem = new Date(inicioDoDia.getTime() - 6 * 60 * 60 * 1000);

  // select mínimo (não include do Servico inteiro) — essa função roda
  // dentro da transação Serializable de criar agendamento
  // (POST /api/agendamentos), então quanto menos ela trouxer, menos tempo
  // a transação fica com lock aberto.
  const agendamentos = await cliente.agendamento.findMany({
    where: {
      barbeiroId,
      data: { gte: margem, lte: fimDoDia },
      status: { in: ["PENDENTE", "CONFIRMADO"] },
    },
    select: { data: true, duracaoMinutos: true, servico: { select: { duracaoMinutos: true } } },
  });

  return agendamentos.map((ag) => {
    const inicio = new Date(ag.data);
    const duracao = ag.duracaoMinutos ?? ag.servico.duracaoMinutos;
    return { inicio, fim: new Date(inicio.getTime() + duracao * 60000) };
  });
}

// Sobreposição de intervalos meio-aberto [inicio, fim) — dois agendamentos
// só não conflitam se um termina antes do outro começar (ou vice-versa).
export function conflitaComOcupados(inicio: Date, fim: Date, ocupados: Ocupado[]) {
  return ocupados.some((o) => inicio < o.fim && fim > o.inicio);
}

// Todo horário oferecido começa em ponto ou meia — igual a disponibilidade
// que o barbeiro cadastra (ver POST /api/disponibilidade). Antes, o
// intervalo entre um horário e outro era o tamanho do próprio serviço (um
// corte de 90min pulava 9:00 → 10:30 → 12:00...), o que escondia horários
// de 30min que ainda cabiam no meio. Agora sempre pula de 30 em 30 — um
// serviço mais longo continua marcando vários desses horários como
// ocupados (qualquer um que, começando ali, invadiria um agendamento já
// existente), então o tempo de verdade continua "descontado" certinho.
const PASSO_GRADE_MINUTOS = 30;

/**
 * Calcula os horários livres de um barbeiro em uma data específica.
 *
 * Regra: pega a janela de disponibilidade que o barbeiro cadastrou para
 * aquele dia da semana, oferece um horário a cada 30min dentro dela (desde
 * que o serviço inteiro caiba antes do fim da janela), e marca como
 * ocupado qualquer horário que colida com um agendamento já
 * PENDENTE/CONFIRMADO (um agendamento pendente já "segura" o horário até
 * o barbeiro decidir).
 */
export async function calcularHorariosLivres(params: {
  barbeiroId: string;
  data: string; // "2026-08-20"
  duracaoMinutos: number;
}) {
  const { barbeiroId, data, duracaoMinutos } = params;
  // Fuso fixo (America/Sao_Paulo, -03:00, sem horário de verão desde 2019) —
  // sem isso, o "HH:MM" seria interpretado no fuso do processo Node, que em
  // produção (Vercel) roda em UTC e divergiria do horário que o cliente pediu.
  const dataBase = new Date(`${data}T00:00:00-03:00`);
  const diaDaSemana = dataBase.getUTCDay();

  const disponibilidades = await db.disponibilidade.findMany({
    where: { barbeiroId, diaDaSemana },
  });
  // Diferencia "o barbeiro não atende nesse dia da semana" (dado que falta)
  // de "atende, mas não sobrou horário livre" — pro cliente entender por
  // que a lista veio vazia em vez de parecer que o sistema quebrou.
  if (disponibilidades.length === 0) return { horarios: [], ocupados: [], semExpediente: true, diaEncerrado: false };
  // Guarda defensiva: com duração 0 (ou negativa) o cursor do loop abaixo
  // nunca avança e a requisição trava para sempre. Hoje as rotas que chamam
  // essa função já validam duracaoMinutos > 0 via zod, mas essa função é
  // citada no CLAUDE.md como "a lógica mais delicada do sistema" — não deve
  // depender só da validação de quem chama.
  if (duracaoMinutos <= 0) return { horarios: [], ocupados: [], semExpediente: false, diaEncerrado: false };

  const agendamentosOcupados = await buscarAgendamentosOcupados(db, { barbeiroId, data });

  const agora = new Date();
  const slotsLivres: string[] = [];
  // Horários dentro do expediente que já têm agendamento — o cliente
  // continua vendo esses horários na tela (cinza, sem poder clicar), em
  // vez deles simplesmente desaparecerem da lista.
  const slotsOcupados: string[] = [];
  // true se pelo menos uma janela de disponibilidade ainda não terminou —
  // distingue "esse dia já passou/o expediente já encerrou" (nenhuma
  // janela futura) de "está genuinamente lotado" (tem janela futura, mas
  // tudo que sobrou já foi ocupado), pra não mostrar a mesma mensagem
  // confusa nos dois casos.
  let algumaJanelaFutura = false;

  for (const janela of disponibilidades) {
    const [horaIni, minIni] = janela.horaInicio.split(":").map(Number);
    const [horaFim, minFim] = janela.horaFim.split(":").map(Number);

    // +3 porque dataBase está em UTC (America/Sao_Paulo = UTC-3) — setUTCHours
    // ignora o fuso do processo Node, então o instante final é sempre o
    // mesmo horário de Brasília, não importa onde o servidor estiver rodando.
    let cursor = new Date(dataBase);
    cursor.setUTCHours(horaIni + 3, minIni, 0, 0);
    const fimJanela = new Date(dataBase);
    fimJanela.setUTCHours(horaFim + 3, minFim, 0, 0);
    if (fimJanela.getTime() > agora.getTime()) algumaJanelaFutura = true;

    while (cursor.getTime() + duracaoMinutos * 60000 <= fimJanela.getTime()) {
      const fimDoSlot = new Date(cursor.getTime() + duracaoMinutos * 60000);
      const horaFormatada = cursor.toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }); // "14:30"

      if (conflitaComOcupados(cursor, fimDoSlot, agendamentosOcupados)) {
        slotsOcupados.push(horaFormatada);
      } else if (cursor.getTime() > agora.getTime()) {
        // Não oferece horário que já passou (só é relevante quando "data" é hoje).
        slotsLivres.push(horaFormatada);
      }

      cursor = new Date(cursor.getTime() + PASSO_GRADE_MINUTOS * 60000);
    }
  }

  // Janelas de disponibilidade sobrepostas no mesmo dia podem gerar o mesmo
  // horário mais de uma vez.
  return {
    horarios: Array.from(new Set(slotsLivres)).sort(),
    ocupados: Array.from(new Set(slotsOcupados)).sort(),
    semExpediente: false,
    diaEncerrado: !algumaJanelaFutura,
  };
}
