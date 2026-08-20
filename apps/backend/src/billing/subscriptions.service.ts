import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import { SessionPayload } from '@/auth/session-payload';
import { calcCommission, CommissionPolicy } from '@/common/commission';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/notifications/notifications.service';
import { StripeService } from './stripe.service';

export interface CheckoutBody {
  email?: unknown;
  isTrial?: unknown;
}

export interface CancelBody {
  switchToOfferId?: unknown;
}

export interface ReactivateBody {
  clearPending?: unknown;
}

export interface ListSubscribersQuery {
  cursor?: string;
  limit?: string;
}

const STATUS_ATIVOS = ['active', 'canceling', 'trialing', 'past_due'];
const MAX_SUBSCRIBERS_PAGE = 100;

/** `code` só existe em erro do Prisma; entrada não confiável até provar o contrário. */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  return (erro as { code?: unknown }).code === 'P2002';
}

/**
 * D80 — `listar()` é leitura PURA. Sem chamada ao Stripe, sem `update` de
 * status, sem criar notificação, sem tocar em `Student`. O legado fazia as
 * quatro coisas dentro do GET porque o webhook antigo não era confiável o
 * bastante (check-then-act, A74); esta fatia está justamente endurecendo o
 * webhook (D75/D76), o que torna o polling redundante.
 *
 * D78 — `checkout()` não faz `findFirst` antes de criar: grava direto e deixa
 * o índice único parcial (`PartnerSubscription_userId_partnerId_active_key`)
 * decidir. P2002 vira 409, não corrida perdida.
 *
 * D81 — `verificarCheckout()` reconcilia com o webhook em vez de tratar P2002
 * como erro: quem perde a corrida busca a linha que o outro criou.
 *
 * Spec: docs/implementation-plans/epic-nest-assinatura-cliente.md
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ────────────────────────────────────────────────────────────────────────
   * Leitura
   * ──────────────────────────────────────────────────────────────────────── */

  async listar(userId: string): Promise<{ subscriptions: unknown[]; trainers: unknown[]; systemSettings: unknown }> {
    const [subscriptions, students, systemSettings] = await Promise.all([
      this.prisma.partnerSubscription.findMany({
        where: { userId, status: { in: STATUS_ATIVOS } },
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          offer: { include: { partner: { include: { user: { select: { id: true, name: true, image: true, email: true } } } } } },
        },
      }),
      this.prisma.student.findMany({
        where: { userId },
        take: 50,
        include: {
          trainer: {
            select: {
              id: true, name: true, image: true, email: true,
              partnerAccount: {
                select: {
                  id: true, allowTestMode: true,
                  offers: {
                    where: { isActive: true },
                    select: { id: true, name: true, description: true, price: true, hourlyRate: true, hourlyLabel: true },
                  },
                },
              },
            },
          },
          athleteProfiles: { include: { sport: true } },
        },
      }),
      this.prisma.systemSettings.findFirst({ select: { enableB2BTestMode: true } }),
    ]);

    return { subscriptions, trainers: students, systemSettings };
  }

  async listarAssinantes(
    partnerUserId: string,
    query: ListSubscribersQuery,
  ): Promise<{ subscribers: unknown[]; nextCursor: string | null }> {
    const conta = await this.prisma.partnerAccount.findUnique({
      where: { userId: partnerUserId },
      select: { id: true, status: true },
    });
    if (!conta || conta.status !== 'approved') {
      throw new ForbiddenException({ error: 'Parceiro não aprovado.' });
    }

    const cursorDate = query.cursor ? new Date(query.cursor) : undefined;
    if (cursorDate && Number.isNaN(cursorDate.getTime())) {
      throw new BadRequestException({ error: 'Cursor inválido. Use formato ISO 8601.' });
    }

    const limit = Math.min(MAX_SUBSCRIBERS_PAGE, Math.max(1, parseInt(query.limit ?? '100', 10) || 100));

    const subscribers = await this.prisma.partnerSubscription.findMany({
      where: { partnerId: conta.id, ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}) },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { offer: { select: { name: true, price: true } }, user: { select: { name: true, image: true } } },
    });

    return {
      subscribers,
      nextCursor: subscribers.length === limit ? subscribers[subscribers.length - 1].createdAt.toISOString() : null,
    };
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Checkout
   * ──────────────────────────────────────────────────────────────────────── */

  async checkout(
    offerId: string,
    user: SessionPayload | null,
    body: CheckoutBody,
  ): Promise<{ subscription?: unknown; clientSecret?: string; free?: boolean }> {
    const customerEmail =
      user?.email ?? (typeof body.email === 'string' ? body.email : undefined);
    if (!customerEmail) throw new BadRequestException({ error: 'Email é obrigatório.' });

    if (body.isTrial) return this.checkoutTrial(offerId, user, customerEmail);

    const offer = await this.prisma.partnerOffer.findUnique({
      where: { id: offerId, isActive: true },
      include: {
        partner: {
          select: {
            id: true, userId: true, stripeAccountId: true, chargesEnabled: true,
            commissionRate: true, customCommissionRate: true,
            tier: { select: { commissionRate: true, hourlyRatePolicy: true } },
          },
        },
      },
    });
    if (!offer) throw new NotFoundException({ error: 'Oferta não encontrada ou inativa.' });

    const totalPrice = (offer.price ?? 0) + (offer.hourlyRate ?? 0);
    if (totalPrice <= 0) return this.checkoutGratis(offer, user, customerEmail);

    if (!offer.partner.stripeAccountId || !offer.partner.chargesEnabled) {
      throw new BadRequestException({ error: 'O treinador ainda não configurou a conta de recebimentos.' });
    }

    const cliente = await this.stripe.encontrarOuCriarCliente(customerEmail, user?.name ?? null);

    const settings = await this.prisma.systemSettings.findFirst({ select: { defaultCommissionRate: true } });
    const financeSettings = await this.prisma.platformFinanceSettings.findFirst();

    const commissionRate =
      offer.partner.customCommissionRate ??
      offer.partner.tier?.commissionRate ??
      offer.partner.commissionRate ??
      settings?.defaultCommissionRate ??
      0.15;
    const policy = (offer.partner.tier?.hourlyRatePolicy as CommissionPolicy) ?? 'base_only';

    // A89 — antes calculava um percentual puro e ignorava hourlyRate/policy,
    // cobrando errado toda oferta com taxa por hora (ver epic-nest-stripe-checkout.md).
    const { platformFeeCents, totalCents } = calcCommission({
      basePrice: offer.price ?? 0,
      hourlyRate: offer.hourlyRate ?? 0,
      commissionRate,
      policy,
      stripePercentFee: financeSettings?.stripePercentFee,
      stripeFixedFeeInCents: financeSettings?.stripeFixedFeeInCents,
    });
    const applicationFeePercent = totalCents > 0 ? (platformFeeCents / totalCents) * 100 : commissionRate * 100;

    const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? '';
    const sessao = await this.stripe.criarSessaoDeCheckoutAssinatura({
      customerId: cliente.id,
      returnUrl: `${base}/dashboard/billing?sub_success=true&session_id={CHECKOUT_SESSION_ID}&offer_id=${offerId}`,
      priceAmountEmCentavos: totalCents,
      productName: offer.name,
      destinoDaTransferencia: offer.partner.stripeAccountId,
      percentualDeTaxa: applicationFeePercent,
      metadata: {
        type: 'b2b_subscription',
        offerId: offer.id,
        partnerId: offer.partner.id,
        userId: user?.id ?? 'guest',
        email: customerEmail,
      },
    });

    return { clientSecret: sessao.clientSecret ?? undefined };
  }

  private async checkoutTrial(
    offerId: string,
    user: SessionPayload | null,
    customerEmail: string,
  ): Promise<{ subscription: unknown }> {
    if (!user) throw new UnauthorizedException({ error: 'Você precisa estar logado para iniciar um período de teste.' });

    const settings = await this.prisma.systemSettings.findFirst({ select: { enableB2BTestMode: true } });
    if (!settings?.enableB2BTestMode) {
      throw new ForbiddenException({ error: 'Modo teste desabilitado globalmente.' });
    }

    const offer = await this.prisma.partnerOffer.findUnique({
      where: { id: offerId, isActive: true },
      include: { partner: { select: { id: true, userId: true, allowTestMode: true } } },
    });
    if (!offer || !offer.partner.allowTestMode) {
      throw new ForbiddenException({ error: 'Este treinador não habilitou o modo teste.' });
    }

    const subscription = await this.criarLinha({
      offer, user, customerEmail,
      stripeSubscriptionId: 'trial_grant_' + randomUUID(),
      stripeCustomerId: 'trial_customer_' + user.id,
      priceAtSubscription: 0,
    });

    return { subscription };
  }

  private async checkoutGratis(
    offer: { id: string; partnerId: string; partner: { id: string; userId: string } },
    user: SessionPayload | null,
    customerEmail: string,
  ): Promise<{ subscription: unknown; free: true }> {
    if (!user) throw new UnauthorizedException({ error: 'Você precisa estar logado para assinar.' });

    const subscription = await this.criarLinha({
      offer, user, customerEmail,
      stripeSubscriptionId: 'free_' + randomUUID(),
      stripeCustomerId: 'free_customer_' + user.id,
      priceAtSubscription: 0,
    });

    return { subscription, free: true };
  }

  /**
   * D78 — grava direto, SEM `findFirst` antes. O índice único parcial
   * (`userId`, `partnerId`, status ativo) decide quem ganha a corrida; P2002
   * vira 409.
   */
  private async criarLinha(entrada: {
    offer: { id: string; partnerId: string; partner: { id: string; userId: string } };
    user: SessionPayload;
    customerEmail: string;
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    priceAtSubscription: number;
  }): Promise<{ id: string }> {
    let subscription: { id: string };
    try {
      subscription = await this.prisma.partnerSubscription.create({
        data: {
          offerId: entrada.offer.id,
          partnerId: entrada.offer.partnerId,
          userId: entrada.user.id,
          email: entrada.customerEmail,
          status: 'active',
          stripeSubscriptionId: entrada.stripeSubscriptionId,
          stripeCustomerId: entrada.stripeCustomerId,
          priceAtSubscription: entrada.priceAtSubscription,
        },
      });
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) {
        throw new ConflictException({ error: 'Você já possui uma assinatura com este treinador.' });
      }
      throw erro;
    }

    await this.reconectarStudent(entrada.offer.partner.userId, entrada.user, entrada.customerEmail);

    return subscription;
  }

  /** Vínculo Student, criado ou reconectado na CRIAÇÃO — não a cada leitura (D80). */
  private async reconectarStudent(trainerId: string, user: SessionPayload, email: string): Promise<void> {
    try {
      const existente = await this.prisma.student.findFirst({
        where: { trainerId, OR: [{ email }, { userId: user.id }] },
      });
      if (existente) {
        await this.prisma.student.update({ where: { id: existente.id }, data: { userId: user.id, email } });
      } else {
        await this.prisma.student.create({
          data: { name: user.name ?? email.split('@')[0], email, trainerId, userId: user.id },
        });
      }
    } catch {
      // Não-fatal: a assinatura já está gravada, o vínculo é conveniência de UI.
    }
  }

  /**
   * A84 — o ramo do `DELETE /user/subscriptions/:id` para vínculo SEM
   * assinatura paga: o profissional adicionou o aluno manualmente
   * (plano gratuito), então não existe `PartnerSubscription` nenhuma —
   * desconectar é só soltar o `Student.userId`.
   */
  private async desconectarStudent(
    id: string,
    userId: string,
  ): Promise<{ success: true; message: string }> {
    const vinculo = await this.prisma.student.findUnique({ where: { id } });
    if (!vinculo || vinculo.userId !== userId) throw new NotFoundException({ error: 'Not Found' });

    await this.prisma.student.update({ where: { id: vinculo.id }, data: { userId: null } });
    return { success: true, message: 'Desconectado do treinador com sucesso.' };
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Verificação pós-checkout — D81
   * ──────────────────────────────────────────────────────────────────────── */

  async verificarCheckout(
    sessionId: string,
    user: SessionPayload,
  ): Promise<{ created: boolean; alreadyExists?: boolean; reason?: string; offerName?: string }> {
    if (!sessionId) throw new BadRequestException({ error: 'session_id não informado' });

    const sessao = await this.stripe.recuperarSessaoDeCheckout(sessionId);

    if (sessao.metadata?.type !== 'b2b_subscription' || sessao.paymentStatus === 'unpaid') {
      return { created: false, reason: 'Pagamento não confirmado ou tipo incorreto.' };
    }

    const { offerId } = sessao.metadata;
    const stripeSubId = sessao.subscriptionId;
    if (!offerId || !stripeSubId) return { created: false, reason: 'Metadata incompleto.' };

    const existente = await this.prisma.partnerSubscription.findUnique({
      where: { stripeSubscriptionId: stripeSubId },
    });
    if (existente) return { created: false, alreadyExists: true };

    const offer = await this.prisma.partnerOffer.findUnique({
      where: { id: offerId },
      include: { partner: { select: { id: true, userId: true } } },
    });
    if (!offer) return { created: false, reason: 'Oferta não encontrada.' };

    const realUserId = sessao.metadata.userId === 'guest' ? null : sessao.metadata.userId ?? null;
    const emailFinal = sessao.customerEmail ?? sessao.metadata.email ?? '';

    try {
      await this.prisma.partnerSubscription.create({
        data: {
          offerId, partnerId: offer.partnerId, userId: realUserId, email: emailFinal,
          stripeSubscriptionId: stripeSubId, stripeCustomerId: sessao.customerId ?? '',
          status: 'active',
        },
      });
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro)) throw erro;

      // D81 — perdeu a corrida para o webhook: a linha existe, então é
      // sucesso, não erro. Quem chegou depois reconcilia em vez de competir.
      const criadaPeloWebhook = await this.prisma.partnerSubscription.findUnique({
        where: { stripeSubscriptionId: stripeSubId },
      });
      return { created: false, alreadyExists: !!criadaPeloWebhook };
    }

    if (realUserId) {
      await this.reconectarStudent(offer.partner.userId, { id: realUserId, name: null } as SessionPayload, emailFinal);
    }

    return { created: true, offerName: (offer as { name: string }).name };
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Cancelamento e troca de plano
   * ──────────────────────────────────────────────────────────────────────── */

  async cancelar(
    id: string,
    user: SessionPayload,
    body: CancelBody,
  ): Promise<{ success: true; message: string; requiresNewCheckout?: boolean; offerId?: string; scheduled?: boolean }> {
    const sub = await this.prisma.partnerSubscription.findUnique({
      where: { id },
      include: { offer: { include: { partner: true } } },
    });

    // A84 — o mesmo endpoint atende dois tipos de id: PartnerSubscription
    // (aluno pago) OU Student (vínculo gratuito/manual, sem nenhuma
    // assinatura). `dashboard/profile` chama com o id que tiver — é caminho
    // ativo, não redundância. Sem este ramo, desconectar de um profissional
    // gratuito devolveria 404 para uma ação legítima.
    if (!sub || sub.userId !== user.id) {
      return this.desconectarStudent(id, user.id);
    }

    const ehAssinaturaReal =
      !!sub.stripeSubscriptionId &&
      !sub.stripeSubscriptionId.startsWith('free_') &&
      !sub.stripeSubscriptionId.startsWith('trial_');

    if (body.switchToOfferId) {
      const destino = await this.prisma.partnerOffer.findUnique({
        where: { id: body.switchToOfferId as string, isActive: true },
        select: { id: true, name: true, price: true, hourlyRate: true, partnerId: true },
      });
      if (!destino) throw new NotFoundException({ error: 'Oferta de destino não encontrada.' });
      if (destino.partnerId !== sub.offer.partnerId) {
        throw new BadRequestException({ error: 'Troca de plano permitida apenas entre ofertas do mesmo treinador.' });
      }

      const precoAtual = (sub.offer.price ?? 0) + (sub.offer.hourlyRate ?? 0);
      const precoDestino = (destino.price ?? 0) + (destino.hourlyRate ?? 0);
      const ehUpgrade = precoDestino >= precoAtual;

      if (ehUpgrade) {
        if (ehAssinaturaReal) {
          await this.stripe
            .cancelarAssinatura(sub.stripeSubscriptionId!, sub.offer.partner.stripeAccountId)
            .catch(() => {});
        }
        await this.prisma.partnerSubscription.update({ where: { id }, data: { status: 'canceled', pendingOfferId: null } });
        return {
          success: true, requiresNewCheckout: true, offerId: body.switchToOfferId as string,
          message: `Plano cancelado. Finalize o checkout para ativar "${destino.name}".`,
        };
      }

      if (ehAssinaturaReal) {
        await this.stripe
          .atualizarAssinatura(sub.stripeSubscriptionId!, { cancelAtPeriodEnd: true }, sub.offer.partner.stripeAccountId)
          .catch(() => {});
      }
      await this.prisma.partnerSubscription.update({
        where: { id },
        data: { status: 'canceling', pendingOfferId: body.switchToOfferId as string },
      });
      return { success: true, scheduled: true, message: `Downgrade agendado para "${destino.name}" ao fim do período atual.` };
    }

    if (ehAssinaturaReal) {
      await this.stripe
        .atualizarAssinatura(sub.stripeSubscriptionId!, { cancelAtPeriodEnd: true }, sub.offer.partner.stripeAccountId)
        .catch(() => {});
    }
    await this.prisma.partnerSubscription.update({ where: { id }, data: { status: 'canceling' } });
    return { success: true, message: 'Cancelamento agendado para o fim do período pago.' };
  }

  async reativar(id: string, user: SessionPayload, body: ReactivateBody): Promise<{ success: true; message: string }> {
    const sub = await this.prisma.partnerSubscription.findUnique({
      where: { id },
      include: { offer: { include: { partner: true } } },
    });
    if (!sub || sub.userId !== user.id) throw new NotFoundException({ error: 'Not Found' });

    const ehAssinaturaReal =
      !!sub.stripeSubscriptionId &&
      !sub.stripeSubscriptionId.startsWith('free_') &&
      !sub.stripeSubscriptionId.startsWith('trial_');

    if (ehAssinaturaReal) {
      await this.stripe
        .atualizarAssinatura(sub.stripeSubscriptionId!, { cancelAtPeriodEnd: false }, sub.offer.partner.stripeAccountId)
        .catch(() => {});
    }

    if (body.clearPending) {
      await this.prisma.partnerSubscription.update({ where: { id }, data: { pendingOfferId: null, status: 'active' } });
      return { success: true, message: 'Downgrade cancelado.' };
    }

    await this.prisma.partnerSubscription.update({ where: { id }, data: { status: 'active', pendingOfferId: null } });
    return { success: true, message: 'Assinatura reativada com sucesso.' };
  }
}
