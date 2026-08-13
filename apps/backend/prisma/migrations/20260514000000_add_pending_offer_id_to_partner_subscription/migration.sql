-- Campo para downgrade agendado: offerId a ativar ao fim do período de cobrança atual.
-- Existe no schema mas estava faltando no banco.
ALTER TABLE "PartnerSubscription" ADD COLUMN IF NOT EXISTS "pendingOfferId" TEXT;

-- Snapshot do preço no momento da assinatura (versionamento de preço).
-- Existe no schema mas estava faltando no banco.
ALTER TABLE "PartnerSubscription" ADD COLUMN IF NOT EXISTS "priceAtSubscription" DOUBLE PRECISION;
