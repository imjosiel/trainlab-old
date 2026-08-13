-- AddColumns: Stripe Connect fields to AffiliateAccount
ALTER TABLE "AffiliateAccount" ADD COLUMN "stripeAccountId" TEXT;
ALTER TABLE "AffiliateAccount" ADD COLUMN "stripeAccountStatus" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "AffiliateAccount" ADD COLUMN "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AffiliateAccount" ADD COLUMN "chargesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateAccount_stripeAccountId_key" ON "AffiliateAccount"("stripeAccountId");
CREATE INDEX "AffiliateAccount_stripeAccountId_idx" ON "AffiliateAccount"("stripeAccountId");
