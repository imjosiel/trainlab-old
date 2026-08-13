-- AddColumn: PartnerTier.hourlyRatePolicy
ALTER TABLE "PartnerTier" ADD COLUMN IF NOT EXISTS "hourlyRatePolicy" TEXT NOT NULL DEFAULT 'base_only';
