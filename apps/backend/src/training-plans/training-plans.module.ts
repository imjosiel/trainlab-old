import { Module } from '@nestjs/common';

import { EmailModule } from '@/email/email.module';
import { NotificationsModule } from '@/notifications/notifications.module';
import { TrainingPlanPdfController } from './training-plan-pdf.controller';
import { TrainingPlanPdfService } from './training-plan-pdf.service';
import { TrainingPlansController } from './training-plans.controller';
import { TrainingPlansService } from './training-plans.service';
import { TrainingSessionsController } from './training-sessions.controller';
import { TrainingSessionsService } from './training-sessions.service';

@Module({
  imports: [EmailModule, NotificationsModule],
  controllers: [TrainingPlansController, TrainingSessionsController, TrainingPlanPdfController],
  providers: [TrainingPlansService, TrainingSessionsService, TrainingPlanPdfService],
})
export class TrainingPlansModule {}
