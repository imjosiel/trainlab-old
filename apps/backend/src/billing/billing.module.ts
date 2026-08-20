import { Module } from '@nestjs/common';

import { NotificationsModule } from '@/notifications/notifications.module';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { AffiliateCommissionService } from './affiliate-commission.service';
import { B2BWebhookController } from './b2b-webhook.controller';
import { B2BWebhookService } from './b2b-webhook.service';
import { OffersController, PublicOffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { StripeCheckoutController } from './stripe-checkout.controller';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeService } from './stripe.service';
import {
  CheckoutController,
  SubscribersController,
  SubscriptionsController,
} from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { WebhookClaimService } from './webhook-claim.service';

/**
 * Módulo de dinheiro da fatia 15, completo: o núcleo (claim de webhook,
 * comissão de afiliado) e a segunda metade (ofertas, assinaturas do cliente,
 * override do admin, webhook B2B).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [
    PublicOffersController,
    OffersController,
    SubscriptionsController,
    CheckoutController,
    SubscribersController,
    AdminSubscriptionsController,
    B2BWebhookController,
    StripeCheckoutController,
  ],
  providers: [
    WebhookClaimService,
    AffiliateCommissionService,
    StripeService,
    OffersService,
    SubscriptionsService,
    AdminSubscriptionsService,
    B2BWebhookService,
    StripeCheckoutService,
  ],
  exports: [WebhookClaimService, AffiliateCommissionService, StripeService],
})
export class BillingModule {}
