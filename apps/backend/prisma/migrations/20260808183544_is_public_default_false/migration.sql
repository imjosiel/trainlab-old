-- AlterTable
ALTER TABLE "AffiliateEarning" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "isPublic" SET DEFAULT false;
