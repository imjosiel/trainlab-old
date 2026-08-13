-- Migration: add_usd_price_fields
-- Adiciona campos de preço/priceId em USD para suporte a pagamentos internacionais

-- SaaSTier: Price ID do Stripe em USD
ALTER TABLE "SaaSTier" ADD COLUMN "stripePriceIdUsd" TEXT;

-- PartnerTier: Preço em USD para parceiros internacionais
ALTER TABLE "PartnerTier" ADD COLUMN "priceUsd" DOUBLE PRECISION;

-- CreditPackage: Preço em USD para créditos
ALTER TABLE "CreditPackage" ADD COLUMN "priceUsd" DOUBLE PRECISION;
