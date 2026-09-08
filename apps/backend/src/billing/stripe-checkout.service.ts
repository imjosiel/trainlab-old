import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { calcCommission, CommissionPolicy } from '@/common/commission';
import { PrismaService } from '@/prisma/prisma.service';
import { StripeService } from './stripe.service';

export interface CheckoutB2BBody {
  offerId?: unknown;
  email?: unknown;
  name?: unknown;
  returnUrl?: unknown;
}

export interface CheckoutTierBody {
  toTierId?: unknown;
  returnUrl?: unknown;
  currency?: unknown;
}

export interface PortalBody {
  returnUrl?: unknown;
}

type Currency = 'brl' | 'usd';

function baseUrlOuErro(contexto: string): string {
  const baseUrl = process.env.NEXTAUTH_URL ?? '';
  if (!baseUrl) {
    throw new InternalServerErrorException({
      error: 'Configuração do servidor incompleta. Contate o suporte.',
      contexto,
    });
  }
  return baseUrl;
}

function returnUrlSegura(baseUrl: string, returnUrl: unknown, fallbackPath: string): string {
  return typeof returnUrl === 'string' && returnUrl.startsWith(baseUrl) ? returnUrl : `${baseUrl}${fallbackPath}`;
}

/** Fatia 24 — checkout de vitrine (docs/implementation-plans/epic-nest-stripe-checkout.md). */
@Injectable()
export class StripeCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  async checkoutB2B(user: SessionPayload | null, body: CheckoutB2BBody): Promise<unknown> {
    const offerId = typeof body.offerId === 'string' ? body.offerId : undefined;
    if (!offerId) throw new BadRequestException({ error: 'ID da Oferta é obrigatório' });

    const studentEmail = user?.email ?? (typeof body.email === 'string' ? body.email.trim().substring(0, 254) : null);
    const studentName = user?.name ?? (typeof body.name === 'string' ? body.name.trim().substring(0, 100) : null);
    if (!studentEmail) throw new BadRequestException({ error: 'Email é obrigatório para assinar' });

    const offer = await this.prisma.partnerOffer.findUnique({
      where: { id: offerId },
      include: { partner: { include: { tier: { select: { commissionRate: true, hourlyRatePolicy: true } } } } },
    });
    if (!offer || !offer.isActive) throw new NotFoundException({ error: 'Oferta não encontrada ou inativa' });
    if (!offer.partner.stripeAccountId || !offer.partner.payoutsEnabled) {
      throw new BadRequestException({ error: 'Este parceiro ainda não configurou recebimentos.' });
    }
    if (!offer.stripePriceId) throw new BadRequestException({ error: 'Oferta sem preço configurado no Stripe.' });

    const customerId = await this.encontrarOuCriarClientePersistindo(user, studentEmail, studentName);

    const settings = await this.prisma.systemSettings.findFirst({ select: { defaultCommissionRate: true } });
    const financeSettings = await this.prisma.platformFinanceSettings.findFirst();

    const commissionRate =
      offer.partner.customCommissionRate ??
      offer.partner.tier?.commissionRate ??
      offer.partner.commissionRate ??
      settings?.defaultCommissionRate ??
      0.15;
    const policy = (offer.partner.tier?.hourlyRatePolicy as CommissionPolicy) ?? 'base_only';

    const { platformFeeCents, totalCents } = calcCommission({
      basePrice: offer.price,
      hourlyRate: offer.hourlyRate ?? 0,
      commissionRate,
      policy,
      stripePercentFee: financeSettings?.stripePercentFee,
      stripeFixedFeeInCents: financeSettings?.stripeFixedFeeInCents,
    });
    const applicationFeePercent = totalCents > 0 ? (platformFeeCents / totalCents) * 100 : commissionRate * 100;

    const baseUrl = baseUrlOuErro('CHECKOUT_B2B');
    const safeReturn = returnUrlSegura(baseUrl, body.returnUrl, '/dashboard');

    const metadata = {
      type: 'b2b_subscription',
      offerId: offer.id,
      partnerId: offer.partner.id,
      userId: user?.id ?? 'guest',
      email: studentEmail,
    };

    const sessao = await this.stripe.criarSessaoDeCheckoutRedirect({
      customerId,
      priceId: offer.stripePriceId,
      successUrl: `${safeReturn}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${safeReturn}?canceled=true`,
      destinoDaTransferencia: offer.partner.stripeAccountId,
      percentualDeTaxa: applicationFeePercent,
      metadata,
    });

    return { checkoutUrl: sessao.url };
  }

  async checkoutTierDoParceiro(user: SessionPayload, body: CheckoutTierBody): Promise<unknown> {
    const toTierId = typeof body.toTierId === 'string' ? body.toTierId : undefined;
    if (!toTierId) throw new BadRequestException({ error: 'Tier de destino não informado.' });
    const currency: Currency = body.currency === 'usd' ? 'usd' : 'brl';

    const [partnerAccount, toTier] = await Promise.all([
      this.prisma.partnerAccount.findUnique({ where: { userId: user.id }, select: { id: true, tierId: true, status: true } }),
      this.prisma.partnerTier.findFirst({
        where: { id: toTierId, isActive: true },
        select: { id: true, slug: true, name: true, price: true, priceUsd: true },
      }),
    ]);

    if (!partnerAccount) throw new NotFoundException({ error: 'Conta de parceiro não encontrada.' });
    if (partnerAccount.status !== 'approved') throw new ForbiddenException({ error: 'Conta de parceiro não aprovada.' });
    if (!toTier) throw new NotFoundException({ error: 'Tier de destino não encontrado.' });
    if (toTier.price <= 0) {
      throw new BadRequestException({ error: 'Este tier é gratuito — use /api/partner/tier-request.' });
    }
    if (partnerAccount.tierId === toTier.id) throw new BadRequestException({ error: 'Você já está neste tier.' });

    if (!user.email) {
      throw new BadRequestException({ error: 'Email não disponível na sua conta. Configure um email para continuar.' });
    }
    const customerId = await this.encontrarOuCriarClientePersistindo(user, user.email, user.name ?? null);

    const tierPrice = currency === 'usd' && toTier.priceUsd ? toTier.priceUsd : toTier.price;
    const tierPriceAmountCents = Math.round(tierPrice * 100);

    let precoExistente = await this.stripe.buscarPrecoExistenteDoTier({
      tierId: toTier.id,
      currency,
      unitAmountEmCentavos: tierPriceAmountCents,
    });
    if (!precoExistente) {
      precoExistente = await this.stripe.criarPrecoComProduto({
        unitAmountEmCentavos: tierPriceAmountCents,
        currency,
        productName: `Player.Action — Tier ${toTier.name}`,
        metadata: { tierSlug: toTier.slug, tierId: toTier.id },
      });
    }

    const baseUrl = baseUrlOuErro('CHECKOUT_PARTNER_TIER');
    const safeReturn = returnUrlSegura(baseUrl, body.returnUrl, '/dashboard/partner/apply');

    const sessao = await this.stripe.criarSessaoDeCheckoutRedirect({
      customerId,
      priceId: precoExistente.id,
      successUrl: `${safeReturn}?tier_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${safeReturn}?tier_canceled=true`,
      metadata: {
        type: 'partner_tier_payment',
        partnerId: partnerAccount.id,
        fromTierId: partnerAccount.tierId ?? '',
        toTierId: toTier.id,
        toTierSlug: toTier.slug,
        userId: user.id,
      },
    });

    return { checkoutUrl: sessao.url };
  }

  async statusDoCheckout(sessionId: string, user: SessionPayload | null): Promise<unknown> {
    const sessao = await this.stripe.recuperarSessaoDeCheckout(sessionId);
    const metaUserId = sessao.metadata?.userId;

    if (!user?.isAdmin) {
      const isOwner = Boolean(user?.id) && metaUserId === user?.id;
      const isGuestCheckout = metaUserId === 'guest';
      if (!isOwner && !isGuestCheckout) {
        if (user?.id) throw new ForbiddenException({ error: 'Forbidden' });
        throw new UnauthorizedException({ error: 'Unauthorized' });
      }
    }

    return {
      status: sessao.status,
      paymentStatus: sessao.paymentStatus,
      subscriptionId: sessao.subscriptionId,
      customerId: sessao.customerId,
    };
  }

  async criarSessaoDoPortal(user: SessionPayload, body: PortalBody): Promise<unknown> {
    if (!user.stripeCustomerId) throw new BadRequestException({ error: 'Nenhum customer ID encontrado' });

    const baseUrl = baseUrlOuErro('STRIPE_PORTAL');
    const safeReturnUrl = returnUrlSegura(baseUrl, body.returnUrl, '/dashboard');

    const sessao = await this.stripe.criarSessaoDoPortal({ customerId: user.stripeCustomerId, returnUrl: safeReturnUrl });
    return { url: sessao.url };
  }

  private async encontrarOuCriarClientePersistindo(
    user: SessionPayload | null,
    email: string,
    nome: string | null,
  ): Promise<string> {
    if (user?.id) {
      const dbSub = await this.prisma.userSubscription.findUnique({ where: { userId: user.id }, select: { stripeCustomerId: true } });
      if (dbSub?.stripeCustomerId) return dbSub.stripeCustomerId;
    }

    const cliente = await this.stripe.encontrarOuCriarCliente(email, nome);

    if (user?.id) {
      await this.prisma.userSubscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, stripeCustomerId: cliente.id },
        update: { stripeCustomerId: cliente.id },
      });
    }

    return cliente.id;
  }
}
