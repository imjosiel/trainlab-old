import { Module } from '@nestjs/common';

import { BillingModule } from '@/billing/billing.module';
import { AdminCreditsController } from './admin-credits.controller';
import { AdminCreditsService } from './admin-credits.service';
import { CheckoutCreditosController } from './checkout-creditos.controller';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { CreditsWebhookController } from './credits-webhook.controller';
import { CreditsWebhookService } from './credits-webhook.service';

@Module({
  imports: [BillingModule],
  controllers: [CreditsController, AdminCreditsController, CheckoutCreditosController, CreditsWebhookController],
  providers: [CreditsService, AdminCreditsService, CreditsWebhookService],
  exports: [CreditsService],
})
export class CreditsModule {}
