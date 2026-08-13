-- AlterEnum
ALTER TYPE "PlanStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "SaaSTier" ALTER COLUMN "maxAthletes" DROP NOT NULL,
ALTER COLUMN "maxAthletes" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TrainingPlan" ADD COLUMN     "isManual" BOOLEAN NOT NULL DEFAULT false;
