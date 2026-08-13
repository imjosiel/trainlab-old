-- Fix: Student.userId sem onDelete causava Restrict ao deletar User
-- Agora vira SetNull — o student continua existindo mas desvinculado do User
ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_userId_fkey";
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fix: Conversation.trainerId e studentId sem onDelete causavam Restrict
-- Agora vira Cascade — conversas são deletadas junto com o usuário
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_trainerId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_trainerId_fkey"
  FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_studentId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
