-- AlterTable
ALTER TABLE "Servico" ADD COLUMN     "aprovado" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: cortes que hoje não têm nenhum ServicoBarbeiro eram
-- interpretados como "barbearia toda atende" (regra de negócio 5 antiga).
-- Como essa interpretação deixa de existir (todo corte agora precisa de
-- vínculo explícito), isso preserva o comportamento atual criando um
-- vínculo pra cada barbeiro que já atende naquela barbearia hoje, no
-- preço base — sem isso, todo corte existente sumiria da agenda de todo
-- mundo assim que o código novo entrasse no ar.
INSERT INTO "ServicoBarbeiro" ("id", "servicoId", "barbeiroId", "preco")
SELECT gen_random_uuid()::text, s."id", u."id", s."precoBase"
FROM "Servico" s
JOIN "Usuario" u ON u."barbeariaId" = s."barbeariaId"
  AND (u."papel" = 'BARBEIRO' OR (u."papel" = 'DONO' AND u."atendeComoBarbeiro" = true))
WHERE NOT EXISTS (
  SELECT 1 FROM "ServicoBarbeiro" sb WHERE sb."servicoId" = s."id"
);
