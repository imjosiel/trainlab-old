/*
  Warnings:

  - You are about to drop the column `creditLastResetAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `planCredits` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `purchasedCredits` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `stripeCustomerId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `subscriptionEndsAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `subscriptionId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `subscriptionPlan` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `subscriptionStatus` on the `User` table. All the data in the column will be lost.
  - The `roles` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `updatedAt` to the `AthleteInvite` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PENDING', 'TRAINER', 'ATHLETE', 'STUDENT', 'PARTNER_B2B');

-- CreateEnum
CREATE TYPE "PlanSegment" AS ENUM ('COACH', 'ATHLETE_INDEPENDENT');

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('inactive', 'active', 'trialing', 'past_due', 'canceled');

-- DropForeignKey
ALTER TABLE "PartnerTierRequest" DROP CONSTRAINT "PartnerTierRequest_partnerId_fkey";

-- DropForeignKey
ALTER TABLE "PartnerTierRequest" DROP CONSTRAINT "PartnerTierRequest_toTierId_fkey";

-- DropIndex
DROP INDEX "User_stripeCustomerId_idx";

-- DropIndex
DROP INDEX "User_stripeCustomerId_key";

-- DropIndex
DROP INDEX "User_subscriptionId_key";

-- AlterTable
ALTER TABLE "AthleteInvite" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Exercise" ALTER COLUMN "videoStorageProvider" SET DEFAULT 'r2';

-- AlterTable
ALTER TABLE "PartnerTierRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SystemSettings" ALTER COLUMN "geminiModel" SET DEFAULT 'gemini-2.0-flash';

-- AlterTable
ALTER TABLE "TrainingPlan" ADD COLUMN     "segment" "PlanSegment" NOT NULL DEFAULT 'COACH';

-- AlterTable
ALTER TABLE "TrainingSession" ALTER COLUMN "description" DROP NOT NULL,
ALTER COLUMN "exercises" SET DEFAULT '[]',
ALTER COLUMN "duration" SET DEFAULT 0,
ALTER COLUMN "intensity" SET DEFAULT 'media';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "creditLastResetAt",
DROP COLUMN "planCredits",
DROP COLUMN "purchasedCredits",
DROP COLUMN "stripeCustomerId",
DROP COLUMN "subscriptionEndsAt",
DROP COLUMN "subscriptionId",
DROP COLUMN "subscriptionPlan",
DROP COLUMN "subscriptionStatus",
ALTER COLUMN "email" DROP NOT NULL,
DROP COLUMN "roles",
ADD COLUMN     "roles" "UserRole"[] DEFAULT ARRAY['PENDING']::"UserRole"[];

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubId" TEXT,
    "status" "SubStatus" NOT NULL DEFAULT 'inactive',
    "plan" TEXT NOT NULL DEFAULT 'base',
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCredits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planCredits" INTEGER NOT NULL DEFAULT 0,
    "purchasedCredits" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCredits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_userId_key" ON "UserSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_stripeCustomerId_key" ON "UserSubscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_stripeSubId_key" ON "UserSubscription"("stripeSubId");

-- CreateIndex
CREATE INDEX "UserSubscription_stripeCustomerId_idx" ON "UserSubscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "UserSubscription_status_idx" ON "UserSubscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserCredits_userId_key" ON "UserCredits"("userId");

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCredits" ADD CONSTRAINT "UserCredits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTierRequest" ADD CONSTRAINT "PartnerTierRequest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTierRequest" ADD CONSTRAINT "PartnerTierRequest_toTierId_fkey" FOREIGN KEY ("toTierId") REFERENCES "PartnerTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
