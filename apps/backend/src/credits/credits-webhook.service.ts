import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { EventoStripe, StripeService } from '@/billing/stripe.service';
import { WebhookClaimService } from '@/billing/webhook-claim.service';
import { CreditsService } from './credits.service';

export interface ResultadoDoWebhook {
  received: boolean;
  cached?: boolean;
}

/**
 * Fatia 20 — endpoint dedicado, separado do webhook antigo (mesmo formato
 * da fatia 14/15 pro B2B). Só precisa de UM tipo de evento: `credit_purchase`
 * é pagamento único, sem assinatura recorrente por trás.
 */
@Injectable()
export class CreditsWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly claims: WebhookClaimService,
    private readonly credits: CreditsService,
  ) {}

  async processarWebhook(corpo: string, assinatura: string | null): Promise<ResultadoDoWebhook> {
    let event: EventoStripe;
    try {
      event = this.stripe.verificarAssinatura(
        corpo,
        assinatura,
        process.env.STRIPE_WEBHOOK_SECRET_CREDITS ?? process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (erro) {
      throw new BadRequestException({
        error: `Webhook signature verification failed: ${erro instanceof Error ? erro.message : String(erro)}`,
      });
    }

    const claim = await this.claims.reivindicar(event.id);
    if (claim !== 'reivindicado') {
      return { received: true, cached: true };
    }

    try {
      await this.processarEvento(event);
      await this.claims.concluir(event.id);
      return { received: true };
    } catch (erro) {
      await this.claims.liberar(event.id);
      throw erro;
    }
  }

  private async processarEvento(event: EventoStripe): Promise<void> {
    if (event.type !== 'checkout.session.completed') return;
    if (event.data.object.metadata?.type !== 'credit_purchase') return;

    await this.handleCreditPurchase(event.data.object);
  }

  /**
   * D94 — falha esperada (metadata ausente, pacote não encontrado) continua
   * um no-op silencioso: a sessão pode não ser nossa, ou o pacote pode ter
   * sido apagado depois da compra. Falha inesperada (registrarCompra) SOBE
   * — o legado engolia num catch mudo, e o crédito comprado sumia sem
   * ninguém saber (nem o cliente recebia, nem a Stripe reentregava, porque
   * o evento já tinha sido marcado como processado).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleCreditPurchase(session: any): Promise<void> {
    const userId = session.metadata?.userId;
    const packageId = session.metadata?.packageId;
    if (!userId || !packageId) return;

    const pkg = await this.prisma.creditPackage.findUnique({ where: { id: packageId } });
    if (!pkg) return;

    await this.credits.registrarCompra({
      userId,
      amount: pkg.credits,
      description: `Compra: ${pkg.name}`,
      packageId: pkg.id,
    });

    if (session.customer) {
      const customerId = String(session.customer);
      await this.prisma.userSubscription.upsert({
        where: { userId },
        create: { userId, stripeCustomerId: customerId },
        update: { stripeCustomerId: customerId },
      });
    }
  }
}
