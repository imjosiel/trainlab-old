-- DropIndex
DROP INDEX IF EXISTS "Appointment_confirmToken_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
