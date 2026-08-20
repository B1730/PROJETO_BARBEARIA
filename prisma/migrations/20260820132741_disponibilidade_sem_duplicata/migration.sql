-- CreateIndex
CREATE UNIQUE INDEX "Disponibilidade_barbeiroId_diaDaSemana_horaInicio_horaFim_key" ON "Disponibilidade"("barbeiroId", "diaDaSemana", "horaInicio", "horaFim");
