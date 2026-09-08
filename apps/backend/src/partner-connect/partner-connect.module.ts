import { Module } from '@nestjs/common';

import { BillingModule } from '@/billing/billing.module';
import { NotificationsModule } from '@/notifications/notifications.module';
import { PartnerConnectController } from './partner-connect.controller';
import { PartnerConnectService } from './partner-connect.service';

@Module({
  imports: [BillingModule, NotificationsModule],
  controllers: [PartnerConnectController],
  providers: [PartnerConnectService],
})
export class PartnerConnectModule {}
