-- Migration: add confirmToken fields to Appointment
ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "confirmToken"     TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "confirmExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmedAt"      TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_confirmToken_key" ON "Appointment"("confirmToken");
CREATE INDEX IF NOT EXISTS "Appointment_confirmToken_idx" ON "Appointment"("confirmToken");
