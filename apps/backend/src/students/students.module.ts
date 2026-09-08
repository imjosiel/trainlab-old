import { Module } from '@nestjs/common';

import { EmailModule } from '@/email/email.module';
import { NotificationsModule } from '@/notifications/notifications.module';
import { StudentInvitesController } from './student-invites.controller';
import { StudentInvitesService } from './student-invites.service';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [EmailModule, NotificationsModule],
  controllers: [StudentsController, StudentInvitesController],
  providers: [StudentsService, StudentInvitesService],
})
export class StudentsModule {}
