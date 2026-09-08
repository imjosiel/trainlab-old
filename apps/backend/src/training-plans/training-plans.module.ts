import { Module } from '@nestjs/common';

import { CreditsModule } from '@/credits/credits.module';
import { EmailModule } from '@/email/email.module';
import { NotificationsModule } from '@/notifications/notifications.module';
import { TrainingPlanPdfController } from './training-plan-pdf.controller';
import { TrainingPlanPdfService } from './training-plan-pdf.service';
import { TrainingPlansController } from './training-plans.controller';
import { TrainingPlansService } from './training-plans.service';
import { TrainingSessionsController } from './training-sessions.controller';
import { TrainingSessionsService } from './training-sessions.service';
import { TrainingPlansCreateService } from './training-plans-create.service';
import { AiService } from './ai.service';
import { TrainingPlansLimitsService } from './training-plans-limits.service';

@Module({
  imports: [EmailModule, NotificationsModule, CreditsModule],
  controllers: [TrainingPlansController, TrainingSessionsController, TrainingPlanPdfController],
  providers: [TrainingPlansService, TrainingSessionsService, TrainingPlanPdfService, TrainingPlansCreateService, AiService, TrainingPlansLimitsService],
})
export class TrainingPlansModule {}
