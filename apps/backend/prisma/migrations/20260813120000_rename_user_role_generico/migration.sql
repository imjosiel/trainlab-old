-- Renomeia UserRole para vocabulário genérico, sem perder dado.
--
--   TRAINER → PROFESSIONAL
--   ATHLETE → INDIVIDUAL
--   STUDENT → CLIENT
--
-- POR QUE `ALTER TYPE ... RENAME VALUE` e não o diff automático do Prisma:
-- o diff padrão para "valor de enum mudou de nome" é DROP TYPE + CREATE TYPE,
-- que **descarta os dados** da coluna. `RENAME VALUE` preserva as linhas
-- existentes — é rename de rótulo, não recriação. Exige Postgres 10+ (aqui: 18.4).
--
-- Rename 1:1, sem fusão de conceitos: `INDIVIDUAL` (usa a plataforma sozinho) e
-- `CLIENT` (é atendido por um profissional) continuam distintos.
--
-- Contexto: este núcleo será forkado para outros verticais (personal, música,
-- psicologia). Nomes de futebol viajariam para dentro desses repos, e renomear
-- depois custaria uma migração por repo em banco com dados reais.

ALTER TYPE "UserRole" RENAME VALUE 'TRAINER' TO 'PROFESSIONAL';
ALTER TYPE "UserRole" RENAME VALUE 'ATHLETE' TO 'INDIVIDUAL';
ALTER TYPE "UserRole" RENAME VALUE 'STUDENT' TO 'CLIENT';

-- `SaaSTier.targetRole` é coluna **String**, não do enum: renomear o tipo não a
-- alcança. Sem este UPDATE, um banco com tiers cadastrados manteria 'TRAINER'
-- num campo que o código passa a comparar com 'PROFESSIONAL' — e a comparação
-- falharia em silêncio, sem erro de banco nem de tipo.
UPDATE "SaaSTier" SET "targetRole" = 'PROFESSIONAL' WHERE "targetRole" = 'TRAINER';
UPDATE "SaaSTier" SET "targetRole" = 'INDIVIDUAL'   WHERE "targetRole" = 'ATHLETE';
UPDATE "SaaSTier" SET "targetRole" = 'CLIENT'       WHERE "targetRole" = 'STUDENT';

ALTER TABLE "SaaSTier" ALTER COLUMN "targetRole" SET DEFAULT 'PROFESSIONAL';
