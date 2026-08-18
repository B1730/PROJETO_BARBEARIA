-- DropIndex
DROP INDEX "Agendamento_barbeiroId_data_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Agendamento_barbeiroId_data_key" ON "Agendamento"("barbeiroId", "data");
