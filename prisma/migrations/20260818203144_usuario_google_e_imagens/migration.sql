-- AlterTable
ALTER TABLE "Servico" ADD COLUMN     "imagemUrl" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "fotoUrl" TEXT,
ALTER COLUMN "senhaHash" DROP NOT NULL;
