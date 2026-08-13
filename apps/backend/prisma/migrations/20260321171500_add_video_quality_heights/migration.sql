-- AlterTable: add videoQualityHeights to SaaSTier
ALTER TABLE "SaaSTier" ADD COLUMN "videoQualityHeights" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
