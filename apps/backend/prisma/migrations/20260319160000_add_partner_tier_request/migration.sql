-- Add price column to PartnerTier
ALTER TABLE "PartnerTier" ADD COLUMN IF NOT EXISTS "price" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Create PartnerTierRequest table
CREATE TABLE IF NOT EXISTS "PartnerTierRequest" (
    "id"           TEXT NOT NULL,
    "partnerId"    TEXT NOT NULL,
    "fromTierId"   TEXT,
    "toTierId"     TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "note"         TEXT,
    "reviewedAt"   TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerTierRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PartnerTierRequest_partnerId_fkey"
        FOREIGN KEY ("partnerId") REFERENCES "PartnerAccount"("id") ON DELETE CASCADE,
    CONSTRAINT "PartnerTierRequest_toTierId_fkey"
        FOREIGN KEY ("toTierId") REFERENCES "PartnerTier"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "PartnerTierRequest_partnerId_idx" ON "PartnerTierRequest"("partnerId");
CREATE INDEX IF NOT EXISTS "PartnerTierRequest_status_idx" ON "PartnerTierRequest"("status");
