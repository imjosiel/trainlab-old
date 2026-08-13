-- AlterTable: adicionar updatedAt com valor default para registros existentes
-- Primeiro adiciona a coluna com um default temporário, depois remove o default.
ALTER TABLE "AffiliateEarning" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
