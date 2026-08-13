-- Add moduleAffiliateEnabled to SystemSettings
ALTER TABLE "SystemSettings" ADD COLUMN "moduleAffiliateEnabled" BOOLEAN NOT NULL DEFAULT true;
