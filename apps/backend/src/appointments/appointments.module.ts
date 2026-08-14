import { Module } from '@nestjs/common';

import { NotificationsModule } from '@/notifications/notifications.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { BlockedSlotsController } from './blocked-slots.controller';
import { BlockedSlotsService } from './blocked-slots.service';
import { CalendarService } from './calendar.service';
import { ScheduleConfigController } from './schedule-config.controller';
import { ScheduleConfigService } from './schedule-config.service';

@Module({
  // Agendamento cria notificação (D70) — e criar notificação aqui significa
  // gravar E emitir o push, porque o Nest não tem o `$extends` do monolito.
  imports: [NotificationsModule],
  controllers: [AppointmentsController, ScheduleConfigController, BlockedSlotsController],
  providers: [AppointmentsService, ScheduleConfigService, BlockedSlotsService, CalendarService],
})
export class AppointmentsModule {}
