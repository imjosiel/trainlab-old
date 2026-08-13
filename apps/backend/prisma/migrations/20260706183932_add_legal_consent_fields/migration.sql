-- AlterTable: campos de consentimento legal (LGPD / CDC)
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3);

ALTER TABLE "PartnerAccount" ADD COLUMN "contractAcceptedAt" TIMESTAMP(3);

ALTER TABLE "AffiliateAccount" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
