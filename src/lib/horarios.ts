import { db } from "./db";

/**
 * Calcula os horários livres de um barbeiro em uma data específica.
 *
 * Regra: pega a janela de disponibilidade que o barbeiro cadastrou para
 * aquele dia da semana, quebra em blocos do tamanho do serviço escolhido,
 * e remove os blocos que já têm agendamento PENDENTE ou CONFIRMADO
 * (um agendamento pendente já "segura" o horário até o barbeiro decidir).
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
  if (disponibilidades.length === 0) return [];

  const inicioDoDia = dataBase;
  const fimDoDia = new Date(`${data}T23:59:59-03:00`);

  const agendamentosOcupados = await db.agendamento.findMany({
    where: {
      barbeiroId,
      data: { gte: inicioDoDia, lte: fimDoDia },
      status: { in: ["PENDENTE", "CONFIRMADO"] },
    },
    include: { servico: true },
  });

  const slotsLivres: string[] = [];

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

    while (cursor.getTime() + duracaoMinutos * 60000 <= fimJanela.getTime()) {
      const fimDoSlot = new Date(cursor.getTime() + duracaoMinutos * 60000);

      const conflita = agendamentosOcupados.some((ag) => {
        const inicioAg = new Date(ag.data);
        const fimAg = new Date(inicioAg.getTime() + ag.servico.duracaoMinutos * 60000);
        return cursor < fimAg && fimDoSlot > inicioAg;
      });

      if (!conflita) {
        slotsLivres.push(
          cursor.toLocaleTimeString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }) // "14:30"
        );
      }

      cursor = new Date(cursor.getTime() + duracaoMinutos * 60000);
    }
  }

  // Janelas de disponibilidade sobrepostas no mesmo dia podem gerar o mesmo
  // horário mais de uma vez.
  return Array.from(new Set(slotsLivres)).sort();
}
