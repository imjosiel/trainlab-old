-- Migration: add_isDefault_to_partner_tier
-- Adds a boolean flag to mark which PartnerTier is the default for new partner registrations.
-- This decouples the enrollment logic from the hardcoded slug 'starter'.

ALTER TABLE "PartnerTier" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Mark 'starter' as the default tier for existing installations
UPDATE "PartnerTier" SET "isDefault" = true WHERE slug = 'starter';
