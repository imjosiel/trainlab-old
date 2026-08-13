-- AlterTable: adiciona campo aiSummary ao modelo Exercise
-- Campo opcional (nullable), invisível ao usuário.
-- Gerado automaticamente por IA no momento da criação/edição do exercício.
-- Utilizado nos prompts de geração de lista de treinos em vez da descrição completa.
ALTER TABLE "Exercise" ADD COLUMN "aiSummary" TEXT;
