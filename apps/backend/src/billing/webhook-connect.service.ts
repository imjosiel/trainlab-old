import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { derivarStatusDaContaConectada } from '@/common/stripe-connect-status';
import { NotificationsService } from '@/notifications/notifications.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AffiliateCommissionService } from './affiliate-commission.service';
import { EventoStripe, StripeService } from './stripe.service';
import { WebhookClaimService } from './webhook-claim.service';

export interface ResultadoDoWebhook {
  received: boolean;
  cached?: boolean;
}

/**
 * Fatia 25 — terceiro webhook dedicado, ao lado de `webhook-b2b` (D75) e
 * `webhook-credits`: tier pago do parceiro, sync de conta Connect (parceiro
 * e afiliado), reembolso.
 *
 * D105 — diferente do legado (`handleChargeRefunded` engolia qualquer erro
 * num try/catch mudo), falha ao reverter comissão de afiliado SOBE, mesma
 * política do D77: dinheiro que falha em silêncio é dinheiro que ninguém
 * percebe que sumiu. O envelope libera o claim e a Stripe reentrega.
 */
@Injectable()
export class WebhookConnectService {
  private readonly logger = new Logger(WebhookConnectService.name);

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
      event = this.stripe.verificarAssinatura(corpo, assinatura, process.env.STRIPE_WEBHOOK_SECRET_CONNECT);
    } catch (erro) {
      throw new BadRequestException({
        error: `Webhook signature verification failed: ${erro instanceof Error ? erro.message : String(erro)}`,
      });
    }

    // C1 — ver comentário em b2b-webhook.service.ts: prefixo isola por endpoint.
    const claimId = `connect:${event.id}`;
    const claim = await this.claims.reivindicar(claimId);
    if (claim !== 'reivindicado') {
      return { received: true, cached: true };
    }

    try {
      await this.processarEvento(event);
      await this.claims.concluir(claimId);
      return { received: true };
    } catch (erro) {
      await this.claims.liberar(claimId);
      throw erro;
    }
  }

  private async processarEvento(event: EventoStripe): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        if (event.data.object.metadata?.type === 'partner_tier_payment') {
          await this.sincronizarTierPago(event.data.object.metadata, event.data.object.id, 'checkout');
        }
        return;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        if (event.data.object.metadata?.type === 'partner_tier_payment') {
          await this.sincronizarTierPago(event.data.object.metadata, event.data.object.id, 'subscription');
        }
        return;

      case 'account.updated':
        await this.sincronizarContaConectada(event.data.object);
        return;

      case 'account.application.deauthorized':
        await this.desautorizarContaConectada(event.account ?? '');
        return;

      case 'charge.refunded':
        if (event.data.object.invoice) {
          await this.comissoes.reverter(String(event.data.object.invoice));
        }
        return;

      case 'application_fee.refunded': {
        const chargeId = event.data.object.charge;
        if (!chargeId) return;
        const charge = await this.stripe.buscarCharge(String(chargeId));
        if (charge.invoiceId) await this.comissoes.reverter(charge.invoiceId);
        return;
      }

      default:
        // Tipo que este endpoint não trata. Ignorado, não é erro — o Stripe
        // manda tudo que a assinatura do endpoint cobre.
        return;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────
   * Tier pago — checkout.session.completed e customer.subscription.*
   * ────────────────────────────────────────────────────────────────────── */

  private async sincronizarTierPago(
    metadata: Record<string, string>,
    sourceId: string,
    sourceType: 'checkout' | 'subscription',
  ): Promise<void> {
    const { partnerId, toTierId, toTierSlug, fromTierId } = metadata;
    if (!partnerId || !toTierId || !toTierSlug) {
      this.logger.warn(`[Partner Tier] Metadata incompleto: ${JSON.stringify(metadata)} — source ${sourceType}:${sourceId}`);
      return;
    }

    const toTier = await this.prisma.partnerTier.findUnique({
      where: { id: toTierId },
      select: { id: true, slug: true, name: true, commissionRate: true },
    });
    if (!toTier) {
      this.logger.warn(`[Partner Tier] Tier não encontrado: ${toTierId}`);
      return;
    }

    const atual = await this.prisma.partnerAccount.findUnique({ where: { id: partnerId }, select: { tierId: true } });
    if (atual?.tierId === toTier.id) return;

    // G2 — atômico: sem transação, create falhando deixaria tier trocado sem auditoria.
    await this.prisma.$transaction([
      this.prisma.partnerAccount.update({
        where: { id: partnerId },
        data: { tierId: toTier.id, partnerTier: toTier.slug, commissionRate: toTier.commissionRate },
      }),
      this.prisma.partnerTierRequest.create({
        data: {
          partnerId,
          fromTierId: fromTierId || null,
          toTierId: toTier.id,
          status: 'auto_approved',
          note: `Pagamento confirmado via Stripe ${sourceType === 'checkout' ? 'Checkout' : 'Subscription'} (${sourceType}: ${sourceId})`,
        },
      }),
    ]);
  }

  /* ──────────────────────────────────────────────────────────────────────
   * Sync de Connect — account.updated / account.application.deauthorized
   * ────────────────────────────────────────────────────────────────────── */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async sincronizarContaConectada(account: any): Promise<void> {
    const statusStripe = {
      payoutsEnabled: account.payouts_enabled === true,
      chargesEnabled: account.charges_enabled === true,
      disabledReason: account.requirements?.disabled_reason ?? null,
    };

    const partnerAccount = await this.prisma.partnerAccount.findUnique({ where: { stripeAccountId: account.id } });
    if (partnerAccount) {
      const status = derivarStatusDaContaConectada(statusStripe, true);
      await this.prisma.partnerAccount.update({
        where: { id: partnerAccount.id },
        data: { stripeAccountStatus: status, payoutsEnabled: statusStripe.payoutsEnabled, chargesEnabled: statusStripe.chargesEnabled },
      });
      if (status === 'active' && partnerAccount.stripeAccountStatus !== 'active') {
        await this.notifications.criar({
          userId: partnerAccount.userId,
          type: 'CONNECT_ACCOUNT_ACTIVE',
          title: '✅ Conta de recebimentos ativa!',
          message: 'Sua conta Stripe foi verificada. Agora você pode criar ofertas e receber pagamentos dos seus alunos.',
          link: '/dashboard/partner/offers',
        });
      }
      return;
    }

    const affiliateAccount = await this.prisma.affiliateAccount.findUnique({ where: { stripeAccountId: account.id } });
    if (affiliateAccount) {
      const status = derivarStatusDaContaConectada(statusStripe, false);
      await this.prisma.affiliateAccount.update({
        where: { id: affiliateAccount.id },
        data: {
          stripeAccountStatus: status,
          payoutsEnabled: statusStripe.payoutsEnabled,
          chargesEnabled: statusStripe.chargesEnabled,
        },
      });
      const eraActive = (affiliateAccount as { stripeAccountStatus?: string }).stripeAccountStatus === 'active';
      if (status === 'active' && !eraActive) {
        await this.notifications.criar({
          userId: affiliateAccount.userId,
          type: 'CONNECT_ACCOUNT_ACTIVE',
          title: '✅ Conta de afiliado ativa!',
          message: 'Sua conta Stripe foi verificada. Comissões futuras serão transferidas automaticamente.',
          link: '/dashboard/affiliate',
        });
      }
      return;
    }

    this.logger.warn(`[Connect] account.updated: nenhuma conta encontrada para ${account.id}`);
  }

  private async desautorizarContaConectada(stripeAccountId: string): Promise<void> {
    const partnerAccount = await this.prisma.partnerAccount.findUnique({ where: { stripeAccountId } });
    if (partnerAccount) {
      await this.prisma.partnerAccount.update({
        where: { id: partnerAccount.id },
        data: { stripeAccountStatus: 'not_started', stripeAccountId: null, payoutsEnabled: false, chargesEnabled: false },
      });
      await this.notifications.criar({
        userId: partnerAccount.userId,
        type: 'CONNECT_ACCOUNT_DEAUTHORIZED',
        title: 'Conta Stripe desconectada',
        message: 'Sua conta Stripe foi desconectada. Reconfigure para continuar recebendo pagamentos.',
        link: '/dashboard/partner/onboarding',
      });
      return;
    }

    const affiliateAccount = await this.prisma.affiliateAccount.findUnique({ where: { stripeAccountId } });
    if (affiliateAccount) {
      await this.prisma.affiliateAccount.update({
        where: { id: affiliateAccount.id },
        data: { stripeAccountId: null, stripeAccountStatus: 'not_started', payoutsEnabled: false, chargesEnabled: false },
      });
      await this.notifications.criar({
        userId: affiliateAccount.userId,
        type: 'CONNECT_ACCOUNT_DEAUTHORIZED',
        title: 'Conta Stripe desconectada',
        message: 'Sua conta Stripe de afiliado foi desconectada. Reconfigure para continuar recebendo comissões.',
        link: '/dashboard/affiliate/onboarding',
      });
      return;
    }

    this.logger.warn(`[Connect] deauthorized: nenhuma conta encontrada para ${stripeAccountId}`);
  }
}
