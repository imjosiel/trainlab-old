-- AddColumn: PartnerTier.allowHourlyRate
ALTER TABLE "PartnerTier" ADD COLUMN IF NOT EXISTS "allowHourlyRate" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn: PartnerOffer.hourlyRate
ALTER TABLE "PartnerOffer" ADD COLUMN IF NOT EXISTS "hourlyRate" DOUBLE PRECISION;

-- AddColumn: PartnerOffer.hourlyLabel
ALTER TABLE "PartnerOffer" ADD COLUMN IF NOT EXISTS "hourlyLabel" VARCHAR(60);

-- AddColumn: SystemSettings.aiProvider
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "aiProvider" TEXT NOT NULL DEFAULT 'groq';

-- AddColumn: SystemSettings.geminiModel
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "geminiModel" TEXT NOT NULL DEFAULT 'gemini-1.5-flash';
