import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { NotificationsService } from '@/notifications/notifications.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AffiliateCommissionService } from './affiliate-commission.service';
import { EventoStripe, StripeService } from './stripe.service';
import { WebhookClaimService } from './webhook-claim.service';

export interface ResultadoDoWebhook {
  received: boolean;
  cached?: boolean;
}

/** `code` só existe em erro do Prisma; entrada não confiável até provar o contrário. */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  return (erro as { code?: unknown }).code === 'P2002';
}

/**
 * Endpoint SEPARADO do webhook B2C/créditos/tier (Josiel decidiu — ver spec,
 * "Escopo, e por que ele inclui o webhook"). O Stripe aceita dois endpoints
 * simultâneos, cada um assinando os eventos que trata.
 *
 * Orquestra as duas peças do primeiro commit desta fatia:
 *
 * 1. `WebhookClaimService.reivindicar()` primeiro — D75. Só quem recebe
 *    `reivindicado` processa; os outros dois resultados voltam 200 sem tocar
 *    em nada, porque o Stripe já vai reentregar ou já processou.
 * 2. Dentro do handler, `AffiliateCommissionService.processar()` para
 *    `invoice.payment_succeeded` e como rede de segurança em
 *    `checkout.session.completed` — D76.
 * 3. `concluir()` no sucesso, `liberar()` na falha — para o Stripe poder
 *    reentregar um erro transitório.
 */
@Injectable()
export class B2BWebhookService {
  private readonly logger = new Logger(B2BWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly claims: WebhookClaimService,
    private readonly comissoes: AffiliateCommissionService,
    private readonly notifications: NotificationsService,
  ) {}

  async processarWebhook(corpo: string, assinatura: string | null): Promise<ResultadoDoWebhook> {
    let event: EventoStripe;
    try {
      event = this.stripe.verificarAssinatura(corpo, assinatura);
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
    switch (event.type) {
      case 'checkout.session.completed':
        if (event.data.object.metadata?.type === 'b2b_subscription') {
          await this.handleCheckoutComplete(event.data.object);
        }
        return;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(event.data.object);
        return;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        return;

      case 'invoice.payment_succeeded':
        await this.handleInvoiceSucceeded(event.data.object);
        return;

      case 'invoice.payment_failed':
        await this.handleInvoiceFailed(event.data.object);
        return;

      default:
        // Tipo que este endpoint não trata (ex.: B2C, créditos). Ignorado, não
        // é erro — o Stripe manda tudo que a assinatura do endpoint cobre.
        return;
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   * checkout.session.completed
   * ──────────────────────────────────────────────────────────────────────── */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleCheckoutComplete(session: any): Promise<void> {
    const offerId = session.metadata?.offerId;
    const userId = session.metadata?.userId === 'guest' ? null : session.metadata?.userId ?? null;
    const email = session.customer_details?.email ?? session.metadata?.email;

    if (!offerId || !session.subscription) return;

    const stripeSubscriptionId = String(session.subscription);
    const existente = await this.prisma.partnerSubscription.findUnique({ where: { stripeSubscriptionId } });

    if (!existente) {
      const offer = await this.prisma.partnerOffer.findUnique({
        where: { id: offerId },
        select: { partnerId: true, price: true, hourlyRate: true, partner: { select: { userId: true } } },
      });
      if (!offer) return;

      const priceAtSubscription = (offer.price ?? 0) + (offer.hourlyRate ?? 0);

      try {
        await this.prisma.partnerSubscription.create({
          data: {
            offerId, partnerId: offer.partnerId, userId,
            email: email ?? '',
            stripeSubscriptionId,
            stripeCustomerId: String(session.customer),
            status: 'active',
            priceAtSubscription,
          },
        });
      } catch (erro) {
        // Duplicata (D78): o `verify` do navegador já ganhou a corrida.
        // Reconciliar, não falhar — o Stripe não deve reentregar por isto.
        if (!ehViolacaoDeUnicidade(erro)) throw erro;
      }

      if (userId) {
        await this.reconectarStudent(offer.partner.userId, userId, email);
      }
    } else {
      await this.prisma.partnerSubscription.update({
        where: { stripeSubscriptionId },
        data: { status: 'active', userId, email: email ?? existente.email },
      });
    }

    // D76 — rede de segurança: se `invoice.payment_succeeded` não chegar, a
    // comissão da 1ª mensalidade não fica perdida. A idempotência do D76
    // garante que não duplica se os dois eventos chegarem.
    if (session.invoice) {
      try {
        const sub = await this.prisma.partnerSubscription.findUnique({
          where: { stripeSubscriptionId },
          select: { id: true, offerId: true },
        });
        if (sub) {
          await this.comissoes.processar(sub, {
            id: String(session.invoice),
            amountPaid: session.amount_total ?? 0,
          });
        }
      } catch (erro) {
        this.logger.warn(
          `Comissão não processada no checkout (rede de segurança): ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }
  }

  private async reconectarStudent(trainerId: string, userId: string, email?: string | null): Promise<void> {
    try {
      const existente = await this.prisma.student.findFirst({ where: { userId, trainerId } });
      if (!existente) {
        const usuario = await this.prisma.user.findUnique({ where: { id: userId } });
        await this.prisma.student.create({
          data: {
            name: usuario?.name ?? email?.split('@')[0] ?? 'Aluno B2B',
            email: usuario?.email ?? email ?? '',
            trainerId, userId,
          },
        });
      }
    } catch (erro) {
      this.logger.warn(`Falha ao criar Student: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   * customer.subscription.*
   * ──────────────────────────────────────────────────────────────────────── */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleSubscriptionUpdate(subscription: any): Promise<void> {
    const sub = await this.prisma.partnerSubscription.findUnique({ where: { stripeSubscriptionId: subscription.id } });
    if (!sub) return;

    const cancelAtEnd = subscription.cancel_at_period_end;
    const preservaCanceling = sub.status === 'canceling' && subscription.status === 'active' && cancelAtEnd;
    const novoStatus = preservaCanceling ? 'canceling' : subscription.status;

    await this.prisma.partnerSubscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: { status: novoStatus },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleSubscriptionDeleted(subscription: any): Promise<void> {
    const sub = await this.prisma.partnerSubscription.findUnique({ where: { stripeSubscriptionId: subscription.id } });
    if (!sub) return;

    await this.prisma.partnerSubscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: { status: 'canceled' },
    });

    if (sub.pendingOfferId && sub.userId) {
      await this.notificarDowngradePronto(sub.userId, sub.pendingOfferId);
    }
  }

  private async notificarDowngradePronto(userId: string, pendingOfferId: string): Promise<void> {
    try {
      const pendingOffer = await this.prisma.partnerOffer.findUnique({
        where: { id: pendingOfferId },
        select: { id: true, name: true },
      });
      if (!pendingOffer) return;

      await this.notifications.criar({
        userId,
        type: 'PLAN_DOWNGRADE_READY',
        title: '🔁 Seu downgrade está pronto',
        message: `Seu plano anterior foi encerrado. Acesse a página de assinaturas para ativar "${pendingOffer.name}".`,
        link: '/dashboard/billing',
        metadata: { pendingOfferId: pendingOffer.id, pendingOfferName: pendingOffer.name },
      });
    } catch (erro) {
      this.logger.warn(`Notificação de downgrade não enviada: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   * invoice.*
   * ──────────────────────────────────────────────────────────────────────── */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleInvoiceSucceeded(invoice: any): Promise<void> {
    if (!invoice.subscription) return;

    const stripeSubscriptionId = String(invoice.subscription);
    const sub = await this.prisma.partnerSubscription.findUnique({ where: { stripeSubscriptionId } });
    if (!sub) return;

    const novoStatus = sub.status === 'canceling' ? 'canceling' : 'active';
    await this.prisma.partnerSubscription.update({ where: { id: sub.id }, data: { status: novoStatus } });

    await this.comissoes.processar(
      { id: sub.id, offerId: sub.offerId },
      { id: invoice.id, amountPaid: invoice.amount_paid },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleInvoiceFailed(invoice: any): Promise<void> {
    if (!invoice.subscription) return;

    const stripeSubscriptionId = String(invoice.subscription);
    const sub = await this.prisma.partnerSubscription.findUnique({ where: { stripeSubscriptionId } });
    if (!sub) return;

    await this.prisma.partnerSubscription.update({ where: { id: sub.id }, data: { status: 'past_due' } });

    if (sub.userId) {
      await this.notifications
        .criar({
          userId: sub.userId,
          type: 'PAYMENT_FAILED',
          title: '⚠️ Pagamento do plano falhou',
          message: 'Não conseguimos processar o pagamento do seu plano de treino. Atualize seu cartão para manter o acesso.',
          link: '/dashboard/billing',
        })
        .catch((erro) =>
          this.logger.warn(`Notificação de falha de pagamento não enviada: ${erro instanceof Error ? erro.message : String(erro)}`),
        );
    }
  }
}
