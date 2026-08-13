-- Migration: add TrainerScheduleConfig and BlockedSlot models
-- CreateTable TrainerScheduleConfig
CREATE TABLE IF NOT EXISTS "TrainerScheduleConfig" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "workStartHour" INTEGER NOT NULL DEFAULT 7,
    "workEndHour" INTEGER NOT NULL DEFAULT 22,
    "workDays" INTEGER[] DEFAULT ARRAY[1,2,3,4,5]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainerScheduleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable BlockedSlot
CREATE TABLE IF NOT EXISTS "BlockedSlot" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "label" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlockedSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TrainerScheduleConfig_trainerId_key" ON "TrainerScheduleConfig"("trainerId");
CREATE INDEX IF NOT EXISTS "TrainerScheduleConfig_trainerId_idx" ON "TrainerScheduleConfig"("trainerId");
CREATE INDEX IF NOT EXISTS "BlockedSlot_configId_idx" ON "BlockedSlot"("configId");
CREATE INDEX IF NOT EXISTS "BlockedSlot_startTime_idx" ON "BlockedSlot"("startTime");

-- AddForeignKey
ALTER TABLE "TrainerScheduleConfig" ADD CONSTRAINT "TrainerScheduleConfig_trainerId_fkey"
    FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BlockedSlot" ADD CONSTRAINT "BlockedSlot_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "TrainerScheduleConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
