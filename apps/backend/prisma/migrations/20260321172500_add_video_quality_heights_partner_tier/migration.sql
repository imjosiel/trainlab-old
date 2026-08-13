-- AlterTable: add videoQualityHeights to PartnerTier
ALTER TABLE "PartnerTier" ADD COLUMN "videoQualityHeights" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
