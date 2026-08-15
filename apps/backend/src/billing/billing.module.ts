import { Module } from '@nestjs/common';

import { NotificationsModule } from '@/notifications/notifications.module';
import { AffiliateCommissionService } from './affiliate-commission.service';
import { StripeService } from './stripe.service';
import { WebhookClaimService } from './webhook-claim.service';

/**
 * Núcleo de dinheiro da fatia 15.
 *
 * Ainda sem controller: as rotas (ofertas, checkout, assinaturas do cliente e o
 * webhook) vêm na segunda metade. O que está aqui são as duas peças que o A74 e
 * o A75 descrevem, e que o resto vai usar.
 */
@Module({
  imports: [NotificationsModule],
  providers: [WebhookClaimService, AffiliateCommissionService, StripeService],
  exports: [WebhookClaimService, AffiliateCommissionService, StripeService],
})
export class BillingModule {}
