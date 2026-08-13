-- CreateIndex (idempotency: one commission per invoice per affiliate)
CREATE UNIQUE INDEX "AffiliateEarning_invoiceId_affiliateId_key" ON "AffiliateEarning"("invoiceId", "affiliateId");
