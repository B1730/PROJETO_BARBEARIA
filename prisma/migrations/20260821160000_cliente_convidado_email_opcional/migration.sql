-- AlterTable
-- Usuario.email vira opcional: só pro CLIENTE "convidado" (agenda sem
-- criar conta, identificado por WhatsApp em vez de e-mail — ver regra de
-- negócio 15). A constraint @unique já existente continua valendo; no
-- Postgres, múltiplos NULL não colidem entre si.
ALTER TABLE "Usuario" ALTER COLUMN "email" DROP NOT NULL;
