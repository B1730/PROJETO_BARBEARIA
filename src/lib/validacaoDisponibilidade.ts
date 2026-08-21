import { z } from "zod";

// "HH:MM" com hora 00-23 e minuto 00-59 — o regex sozinho deixava passar
// algo como "25:99", que depois estourava silenciosamente no setUTCHours()
// de src/lib/horarios.ts em vez de dar um erro claro pro barbeiro.
const horaValida = (valor: string) => {
  const [hora, minuto] = valor.split(":").map(Number);
  return hora >= 0 && hora <= 23 && minuto >= 0 && minuto <= 59;
};

// Só de meia em meia hora (minuto 00 ou 30) — mantém os horários que o
// cliente vê batendo certinho com a grade de 30min (09:00, 09:30, 10:00...)
// em vez de janelas com início/fim "quebrado" tipo 09:15.
const horaRedonda = (valor: string) => {
  const minuto = Number(valor.split(":")[1]);
  return minuto === 0 || minuto === 30;
};

// Compartilhado entre POST /api/disponibilidade (criação) e
// PATCH /api/disponibilidade/[id] (edição) — mesma validação nos dois
// casos. Precisa ficar fora de um arquivo route.ts: o Next.js só aceita
// exports com nome de verbo HTTP (ou config) nesses arquivos.
export const schemaDisponibilidade = z
  .object({
    diaDaSemana: z.number().int().min(0).max(6),
    horaInicio: z.string().regex(/^\d{2}:\d{2}$/).refine(horaValida, "Hora inválida").refine(horaRedonda, "Hora precisa ser em ponto ou meia (ex: 09:00, 09:30)"),
    horaFim: z.string().regex(/^\d{2}:\d{2}$/).refine(horaValida, "Hora inválida").refine(horaRedonda, "Hora precisa ser em ponto ou meia (ex: 18:00, 18:30)"),
  })
  // Comparação de string funciona porque o formato é sempre "HH:MM" com
  // zero à esquerda. Sem isso, uma janela invertida (ex.: início 18:00, fim
  // 09:00) era aceita e virava silenciosamente zero horários livres, sem
  // nenhum aviso pro barbeiro sobre o que está errado.
  .refine((dados) => dados.horaInicio < dados.horaFim, {
    message: "Hora de início precisa ser antes da hora de fim",
    path: ["horaFim"],
  });
