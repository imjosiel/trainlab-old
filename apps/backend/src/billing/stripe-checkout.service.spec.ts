import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { StripeCheckoutService } from './stripe-checkout.service';

function prismaMock() {
  return {
    partnerOffer: { findUnique: jest.fn() },
    partnerAccount: { findUnique: jest.fn() },
    partnerTier: { findFirst: jest.fn() },
    userSubscription: { findUnique: jest.fn(), upsert: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
    platformFinanceSettings: { findFirst: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function stripeMock() {
  return {
    encontrarOuCriarCliente: jest.fn().mockResolvedValue({ id: 'cus_novo' }),
    criarSessaoDeCheckoutRedirect: jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' }),
    criarPrecoComProduto: jest.fn().mockResolvedValue({ id: 'price_novo' }),
    buscarPrecoExistenteDoTier: jest.fn().mockResolvedValue(null),
    recuperarSessaoDeCheckout: jest.fn(),
    criarSessaoDoPortal: jest.fn().mockResolvedValue({ url: 'https://billing.stripe.com/portal_1' }),
  };
}

type StripeMock = ReturnType<typeof stripeMock>;

async function bodyOfRejection(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
    throw new Error('esperava rejeição, mas resolveu');
  } catch (err) {
    if (!(err instanceof HttpException)) throw err;
    return err.getResponse() as Record<string, unknown>;
  }
}

const ALUNO = 'aluno-1';
const PARTNER_USER = 'prof-1';

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: ALUNO,
    name: 'Aluno Teste',
    email: 'aluno@example.com',
    image: null,
    roles: ['CLIENT'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: null,
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

const OFERTA = {
  id: 'offer-1',
  price: 100,
  hourlyRate: null,
  isActive: true,
  stripePriceId: 'price_offer_1',
  partner: {
    id: 'partner-1',
    userId: PARTNER_USER,
    stripeAccountId: 'acct_1',
    payoutsEnabled: true,
    commissionRate: 0.2,
    customCommissionRate: null,
    tier: { commissionRate: 0.2, hourlyRatePolicy: 'base_only' },
  },
};

describe('StripeCheckoutService', () => {
  let prisma: PrismaMock;
  let stripe: StripeMock;
  let service: StripeCheckoutService;
  let originalNextAuthUrl: string | undefined;

  beforeEach(() => {
    prisma = prismaMock();
    stripe = stripeMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new StripeCheckoutService(prisma as any, stripe as any);

    originalNextAuthUrl = process.env.NEXTAUTH_URL;
    process.env.NEXTAUTH_URL = 'http://localhost:3000';

    prisma.partnerOffer.findUnique.mockResolvedValue(OFERTA);
    prisma.userSubscription.findUnique.mockResolvedValue(null);
    prisma.systemSettings.findFirst.mockResolvedValue({ defaultCommissionRate: 0.15 });
    prisma.platformFinanceSettings.findFirst.mockResolvedValue({ stripePercentFee: 0.0399, stripeFixedFeeInCents: 39 });
  });

  afterEach(() => {
    process.env.NEXTAUTH_URL = originalNextAuthUrl;
  });

  /* ────────────────────────────────────────────────────────────────────────
   * checkoutB2B — POST /stripe/checkout-b2b
   * ──────────────────────────────────────────────────────────────────────── */

  describe('checkoutB2B', () => {
    it('400 sem offerId', async () => {
      const body = await bodyOfRejection(service.checkoutB2B(sessao(), {}));
      expect(body.error).toMatch(/[Oo]ferta/);
    });

    it('400 sem email nem sessão', async () => {
      const body = await bodyOfRejection(service.checkoutB2B(null, { offerId: 'offer-1' }));
      expect(body.error).toMatch(/[Ee]mail/);
    });

    it('guest com email no body funciona', async () => {
      const resultado = (await service.checkoutB2B(null, {
        offerId: 'offer-1',
        email: 'convidado@example.com',
      })) as Record<string, unknown>;
      expect(resultado.checkoutUrl).toBeDefined();
    });

    it('404 quando a oferta não existe', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.checkoutB2B(sessao(), { offerId: 'offer-1' }));
      expect(body.error).toMatch(/[Nn]ão encontrada/);
    });

    it('404 quando a oferta está inativa', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({ ...OFERTA, isActive: false });
      const body = await bodyOfRejection(service.checkoutB2B(sessao(), { offerId: 'offer-1' }));
      expect(body.error).toMatch(/[Nn]ão encontrada/);
    });

    it('400 quando o parceiro não tem stripeAccountId', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        ...OFERTA,
        partner: { ...OFERTA.partner, stripeAccountId: null },
      });
      const body = await bodyOfRejection(service.checkoutB2B(sessao(), { offerId: 'offer-1' }));
      expect(body.error).toMatch(/recebimentos/);
    });

    it('400 quando o parceiro não tem payoutsEnabled', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        ...OFERTA,
        partner: { ...OFERTA.partner, payoutsEnabled: false },
      });
      const body = await bodyOfRejection(service.checkoutB2B(sessao(), { offerId: 'offer-1' }));
      expect(body.error).toMatch(/recebimentos/);
    });

    it('400 quando a oferta não tem stripePriceId', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({ ...OFERTA, stripePriceId: null });
      const body = await bodyOfRejection(service.checkoutB2B(sessao(), { offerId: 'offer-1' }));
      expect(body.error).toMatch(/preço/);
    });

    it('reaproveita stripeCustomerId já salvo, sem consultar/criar cliente na Stripe', async () => {
      prisma.userSubscription.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_existente' });
      await service.checkoutB2B(sessao(), { offerId: 'offer-1' });

      expect(stripe.encontrarOuCriarCliente).not.toHaveBeenCalled();
      expect(stripe.criarSessaoDeCheckoutRedirect).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cus_existente' }),
      );
    });

    it('sem stripeCustomerId salvo: busca/cria na Stripe e persiste em UserSubscription', async () => {
      await service.checkoutB2B(sessao(), { offerId: 'offer-1' });

      expect(stripe.encontrarOuCriarCliente).toHaveBeenCalledWith('aluno@example.com', 'Aluno Teste');
      expect(prisma.userSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: ALUNO }, create: expect.objectContaining({ stripeCustomerId: 'cus_novo' }) }),
      );
    });

    it('guest não persiste em UserSubscription', async () => {
      await service.checkoutB2B(null, { offerId: 'offer-1', email: 'convidado@example.com' });
      expect(prisma.userSubscription.upsert).not.toHaveBeenCalled();
    });

    it('500 quando NEXTAUTH_URL não está configurado', async () => {
      delete process.env.NEXTAUTH_URL;
      const body = await bodyOfRejection(service.checkoutB2B(sessao(), { offerId: 'offer-1' }));
      expect(body.error).toMatch(/[Cc]onfiguração/);
    });

    it('A89 (mesma correção de subscriptions.service) — usa calcCommission com hourlyRate, não um percentual puro', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({ ...OFERTA, price: 100, hourlyRate: 300 });

      await service.checkoutB2B(sessao(), { offerId: 'offer-1' });

      // Mesmas contas do teste A89 de subscriptions.service.spec.ts: platformFeeCents = 3226 de 40000.
      expect(stripe.criarSessaoDeCheckoutRedirect).toHaveBeenCalledWith(
        expect.objectContaining({ percentualDeTaxa: (3226 / 40000) * 100 }),
      );
    });

    it('metadata inclui type=b2b_subscription, offerId, partnerId, userId e email', async () => {
      await service.checkoutB2B(sessao(), { offerId: 'offer-1' });

      expect(stripe.criarSessaoDeCheckoutRedirect).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            type: 'b2b_subscription',
            offerId: 'offer-1',
            partnerId: 'partner-1',
            userId: ALUNO,
            email: 'aluno@example.com',
          },
          destinoDaTransferencia: 'acct_1',
        }),
      );
    });

    it('metadata userId="guest" quando não há sessão', async () => {
      await service.checkoutB2B(null, { offerId: 'offer-1', email: 'convidado@example.com' });
      expect(stripe.criarSessaoDeCheckoutRedirect).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ userId: 'guest' }) }),
      );
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * checkoutTierDoParceiro — POST /stripe/checkout-partner-tier
   * ──────────────────────────────────────────────────────────────────────── */

  describe('checkoutTierDoParceiro', () => {
    const PARCEIRO = { id: 'partner-1', tierId: 'tier-starter', status: 'approved' };
    const TIER_DESTINO = { id: 'tier-pro', slug: 'pro', name: 'Pro', price: 199.9, priceUsd: 39.9 };

    beforeEach(() => {
      prisma.partnerAccount.findUnique.mockResolvedValue(PARCEIRO);
      prisma.partnerTier.findFirst.mockResolvedValue(TIER_DESTINO);
    });

    it('400 sem toTierId', async () => {
      const body = await bodyOfRejection(service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), {}));
      expect(body.error).toMatch(/[Tt]ier/);
    });

    it('404 quando não há PartnerAccount pro requisitante', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(
        service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), { toTierId: 'tier-pro' }),
      );
      expect(body.error).toMatch(/[Cc]onta de parceiro/);
    });

    it('403 quando a conta não está aprovada', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ ...PARCEIRO, status: 'pending' });
      const body = await bodyOfRejection(
        service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), { toTierId: 'tier-pro' }),
      );
      expect(body.error).toMatch(/aprovada/);
    });

    it('404 quando o tier de destino não existe ou está inativo', async () => {
      prisma.partnerTier.findFirst.mockResolvedValue(null);
      const body = await bodyOfRejection(
        service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), { toTierId: 'tier-inexistente' }),
      );
      expect(body.error).toMatch(/[Tt]ier de destino/);
    });

    it('400 quando o tier de destino é gratuito', async () => {
      prisma.partnerTier.findFirst.mockResolvedValue({ ...TIER_DESTINO, price: 0 });
      const body = await bodyOfRejection(
        service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), { toTierId: 'tier-pro' }),
      );
      expect(body.error).toMatch(/gratuito/);
    });

    it('400 quando já está no tier de destino', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ ...PARCEIRO, tierId: 'tier-pro' });
      const body = await bodyOfRejection(
        service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), { toTierId: 'tier-pro' }),
      );
      expect(body.error).toMatch(/já está/);
    });

    it('400 quando a sessão não tem email', async () => {
      const body = await bodyOfRejection(
        service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER, email: null }), { toTierId: 'tier-pro' }),
      );
      expect(body.error).toMatch(/[Ee]mail/);
    });

    it('reaproveita o Price existente do tier, sem criar um novo', async () => {
      stripe.buscarPrecoExistenteDoTier.mockResolvedValue({ id: 'price_existente' });
      await service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), { toTierId: 'tier-pro' });

      expect(stripe.criarPrecoComProduto).not.toHaveBeenCalled();
      expect(stripe.criarSessaoDeCheckoutRedirect).toHaveBeenCalledWith(
        expect.objectContaining({ priceId: 'price_existente' }),
      );
    });

    it('cria um novo Price+Produto quando não existe um pro tier', async () => {
      stripe.buscarPrecoExistenteDoTier.mockResolvedValue(null);
      await service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), { toTierId: 'tier-pro' });

      expect(stripe.criarPrecoComProduto).toHaveBeenCalledWith(
        expect.objectContaining({ unitAmountEmCentavos: 19990, currency: 'brl' }),
      );
    });

    it('usa priceUsd quando currency=usd e existe', async () => {
      await service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), { toTierId: 'tier-pro', currency: 'usd' });

      expect(stripe.buscarPrecoExistenteDoTier).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'usd', unitAmountEmCentavos: 3990 }),
      );
    });

    it('sem priceUsd: cai pro preço em BRL mesmo pedindo usd', async () => {
      prisma.partnerTier.findFirst.mockResolvedValue({ ...TIER_DESTINO, priceUsd: null });
      await service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), { toTierId: 'tier-pro', currency: 'usd' });

      expect(stripe.buscarPrecoExistenteDoTier).toHaveBeenCalledWith(
        expect.objectContaining({ unitAmountEmCentavos: 19990 }),
      );
    });

    it('500 quando NEXTAUTH_URL não está configurado', async () => {
      delete process.env.NEXTAUTH_URL;
      const body = await bodyOfRejection(
        service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), { toTierId: 'tier-pro' }),
      );
      expect(body.error).toMatch(/[Cc]onfiguração/);
    });

    it('metadata inclui type=partner_tier_payment, partnerId, fromTierId, toTierId, toTierSlug, userId', async () => {
      await service.checkoutTierDoParceiro(sessao({ id: PARTNER_USER }), { toTierId: 'tier-pro' });

      expect(stripe.criarSessaoDeCheckoutRedirect).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            type: 'partner_tier_payment',
            partnerId: 'partner-1',
            fromTierId: 'tier-starter',
            toTierId: 'tier-pro',
            toTierSlug: 'pro',
            userId: PARTNER_USER,
          },
        }),
      );
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * statusDoCheckout — GET /stripe/checkout-status/:sessionId
   * ──────────────────────────────────────────────────────────────────────── */

  describe('statusDoCheckout', () => {
    function sessaoStripe(over: Record<string, unknown> = {}) {
      return {
        id: 'cs_1',
        status: 'complete',
        paymentStatus: 'paid',
        metadata: { userId: ALUNO },
        subscriptionId: 'sub_1',
        customerId: 'cus_1',
        customerEmail: 'aluno@example.com',
        ...over,
      };
    }

    beforeEach(() => {
      stripe.recuperarSessaoDeCheckout.mockResolvedValue(sessaoStripe());
    });

    it('admin acessa qualquer sessão', async () => {
      stripe.recuperarSessaoDeCheckout.mockResolvedValue(sessaoStripe({ metadata: { userId: 'outro' } }));
      const resultado = (await service.statusDoCheckout('cs_1', sessao({ isAdmin: true }))) as Record<string, unknown>;
      expect(resultado.status).toBe('complete');
    });

    it('dono (metadata.userId === session.id) acessa', async () => {
      const resultado = (await service.statusDoCheckout('cs_1', sessao())) as Record<string, unknown>;
      expect(resultado.paymentStatus).toBe('paid');
    });

    it('guest checkout (metadata.userId="guest") acessa mesmo sem sessão', async () => {
      stripe.recuperarSessaoDeCheckout.mockResolvedValue(sessaoStripe({ metadata: { userId: 'guest' } }));
      const resultado = (await service.statusDoCheckout('cs_1', null)) as Record<string, unknown>;
      expect(resultado.subscriptionId).toBe('sub_1');
    });

    it('401 quando não autenticado e não é guest checkout', async () => {
      const body = await bodyOfRejection(service.statusDoCheckout('cs_1', null));
      expect(body.error).toBeDefined();
    });

    it('403 quando autenticado mas não é dono, nem guest, nem admin', async () => {
      const body = await bodyOfRejection(service.statusDoCheckout('cs_1', sessao({ id: 'estranho' })));
      expect(body.error).toBeDefined();
    });

    it('retorna status, paymentStatus, subscriptionId e customerId', async () => {
      const resultado = (await service.statusDoCheckout('cs_1', sessao())) as Record<string, unknown>;
      expect(resultado).toEqual({
        status: 'complete',
        paymentStatus: 'paid',
        subscriptionId: 'sub_1',
        customerId: 'cus_1',
      });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * criarSessaoDoPortal — POST /stripe/portal
   * ──────────────────────────────────────────────────────────────────────── */

  describe('criarSessaoDoPortal', () => {
    it('400 sem stripeCustomerId', async () => {
      const body = await bodyOfRejection(service.criarSessaoDoPortal(sessao({ stripeCustomerId: null }), {}));
      expect(body.error).toMatch(/customer/i);
    });

    it('500 quando NEXTAUTH_URL não está configurado', async () => {
      delete process.env.NEXTAUTH_URL;
      const body = await bodyOfRejection(service.criarSessaoDoPortal(sessao({ stripeCustomerId: 'cus_1' }), {}));
      expect(body.error).toMatch(/[Cc]onfiguração/);
    });

    it('usa o returnUrl informado quando começa com o baseUrl', async () => {
      await service.criarSessaoDoPortal(sessao({ stripeCustomerId: 'cus_1' }), {
        returnUrl: 'http://localhost:3000/dashboard/settings',
      });
      expect(stripe.criarSessaoDoPortal).toHaveBeenCalledWith({
        customerId: 'cus_1',
        returnUrl: 'http://localhost:3000/dashboard/settings',
      });
    });

    it('cai pro fallback /dashboard quando o returnUrl não bate com o baseUrl', async () => {
      await service.criarSessaoDoPortal(sessao({ stripeCustomerId: 'cus_1' }), {
        returnUrl: 'https://malicioso.com/phish',
      });
      expect(stripe.criarSessaoDoPortal).toHaveBeenCalledWith({
        customerId: 'cus_1',
        returnUrl: 'http://localhost:3000/dashboard',
      });
    });

    it('retorna a url da sessão do portal', async () => {
      const resultado = (await service.criarSessaoDoPortal(sessao({ stripeCustomerId: 'cus_1' }), {})) as Record<string, unknown>;
      expect(resultado.url).toBe('https://billing.stripe.com/portal_1');
    });
  });
});
