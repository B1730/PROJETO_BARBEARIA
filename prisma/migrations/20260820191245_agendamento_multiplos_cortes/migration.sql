-- CreateTable
CREATE TABLE "AgendamentoServico" (
    "id" TEXT NOT NULL,
    "agendamentoId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "nomeServico" TEXT NOT NULL,
    "precoServico" DECIMAL(10,2) NOT NULL,
    "duracaoMinutos" INTEGER NOT NULL,

    CONSTRAINT "AgendamentoServico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgendamentoServico_agendamentoId_idx" ON "AgendamentoServico"("agendamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "AgendamentoServico_agendamentoId_servicoId_key" ON "AgendamentoServico"("agendamentoId", "servicoId");

-- AddForeignKey
ALTER TABLE "AgendamentoServico" ADD CONSTRAINT "AgendamentoServico_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "Agendamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendamentoServico" ADD CONSTRAINT "AgendamentoServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "Agendamento" DROP CONSTRAINT "Agendamento_servicoId_fkey";

-- AlterTable (agendamentos antigos perdem a referência de corte único —
-- não tem como fazer backfill automático pra AgendamentoServico a partir
-- daqui, então o esperado é limpar o banco de teste depois dessa migração,
-- mesmo padrão já usado neste projeto)
ALTER TABLE "Agendamento" DROP COLUMN "servicoId";
