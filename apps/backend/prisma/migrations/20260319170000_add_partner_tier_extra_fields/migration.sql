-- AddColumn: PartnerTier — todas as colunas que podem faltar (safe / idempotente)
ALTER TABLE "PartnerTier" ADD COLUMN IF NOT EXISTS "allowFlexibleDistribution" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PartnerTier" ADD COLUMN IF NOT EXISTS "allowHourlyRate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PartnerTier" ADD COLUMN IF NOT EXISTS "hourlyRatePolicy" TEXT NOT NULL DEFAULT 'base_only';
ALTER TABLE "PartnerTier" ADD COLUMN IF NOT EXISTS "payoutDelayDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "PartnerTier" ADD COLUMN IF NOT EXISTS "creditsPerPeriod" INTEGER;
ALTER TABLE "PartnerTier" ADD COLUMN IF NOT EXISTS "creditResetPeriod" TEXT;
ALTER TABLE "PartnerTier" ADD COLUMN IF NOT EXISTS "price" DOUBLE PRECISION NOT NULL DEFAULT 0;
