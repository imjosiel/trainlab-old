-- AlterTable: make stripeSubscriptionId and stripeCustomerId optional in PartnerSubscription
-- This allows admin-granted test subscriptions without a real Stripe subscription

ALTER TABLE "PartnerSubscription" ALTER COLUMN "stripeSubscriptionId" DROP NOT NULL;
ALTER TABLE "PartnerSubscription" ALTER COLUMN "stripeCustomerId" DROP NOT NULL;
