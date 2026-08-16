import { Module } from '@nestjs/common';

import { BillingModule } from '@/billing/billing.module';
import { AdminCreditsController } from './admin-credits.controller';
import { AdminCreditsService } from './admin-credits.service';
import { CheckoutCreditosController } from './checkout-creditos.controller';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

@Module({
  imports: [BillingModule],
  controllers: [CreditsController, AdminCreditsController, CheckoutCreditosController],
  providers: [CreditsService, AdminCreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
