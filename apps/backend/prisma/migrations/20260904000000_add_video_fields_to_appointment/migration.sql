-- Fatia 37 — vídeo 1:1 próprio, aditivo (Meet continua intacto)
ALTER TABLE "Appointment" ADD COLUMN "videoProvider" VARCHAR(20),
ADD COLUMN "videoRoomName" VARCHAR(100),
ADD COLUMN "videoJoinUrl" VARCHAR(500);
