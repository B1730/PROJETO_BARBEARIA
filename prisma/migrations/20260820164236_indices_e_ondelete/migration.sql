-- DropIndex (redundante desde que o índice único de disponibilidade_sem_duplicata
-- já cobre buscas por barbeiroId via prefixo esquerdo)
DROP INDEX "Disponibilidade_barbeiroId_idx";

-- CreateIndex (GET /api/agendamentos filtra por clienteId pra CLIENTE, sem índice)
CREATE INDEX "Agendamento_clienteId_idx" ON "Agendamento"("clienteId");

-- AlterForeignKey (SET NULL -> RESTRICT: apagar uma Barbearia não pode deixar
-- barbeiro/dono órfãos com barbeariaId nulo)
ALTER TABLE "Usuario" DROP CONSTRAINT "Usuario_barbeariaId_fkey";
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_barbeariaId_fkey" FOREIGN KEY ("barbeariaId") REFERENCES "Barbearia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
