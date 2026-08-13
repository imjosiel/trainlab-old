-- AddColumn: SystemSettings.autoApproveTierChange
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "autoApproveTierChange" BOOLEAN NOT NULL DEFAULT true;
