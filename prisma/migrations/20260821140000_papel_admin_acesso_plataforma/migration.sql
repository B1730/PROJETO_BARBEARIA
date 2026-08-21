-- AlterEnum
ALTER TYPE "PapelUsuario" ADD VALUE 'ADMIN';

-- CreateTable
CREATE TABLE "AcessoPlataforma" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "barbeariaId" TEXT NOT NULL,
    "motivo" TEXT,
    "concedidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogadoEm" TIMESTAMP(3),

    CONSTRAINT "AcessoPlataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcessoPlataforma_usuarioId_idx" ON "AcessoPlataforma"("usuarioId");

-- CreateIndex
CREATE INDEX "AcessoPlataforma_barbeariaId_idx" ON "AcessoPlataforma"("barbeariaId");

-- AddForeignKey
ALTER TABLE "AcessoPlataforma" ADD CONSTRAINT "AcessoPlataforma_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcessoPlataforma" ADD CONSTRAINT "AcessoPlataforma_barbeariaId_fkey" FOREIGN KEY ("barbeariaId") REFERENCES "Barbearia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
