import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { SubscriptionsService } from './subscriptions.service';

/** Erro do Prisma para violação de unicidade — é o índice parcial do D78. */
function p2002() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

function prismaMock() {
  return {
    partnerSubscription: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    partnerOffer: { findUnique: jest.fn() },
    student: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    partnerAccount: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
    userSubscription: { findUnique: jest.fn(), upsert: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function stripeMock() {
  return {
    encontrarOuCriarCliente: jest.fn().mockResolvedValue({ id: 'cus_1' }),
    criarSessaoDeCheckoutAssinatura: jest.fn().mockResolvedValue({ id: 'cs_1', clientSecret: 'secret_1' }),
    recuperarSessaoDeCheckout: jest.fn(),
    cancelarAssinatura: jest.fn().mockResolvedValue(undefined),
    atualizarAssinatura: jest.fn().mockResolvedValue(undefined),
  };
}

function notificationsMock() {
  return { criar: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
}

async function bodyOfRejection(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
    throw new Error('esperava rejeição, mas resolveu');
  } catch (err) {
    if (!(err instanceof HttpException)) throw err;
    return err.getResponse() as Record<string, unknown>;
  }
}

const EU = 'aluno-1';
const OFFER = 'offer-1';
const PARTNER = 'pa-1';

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: EU,
    name: 'Aluno',
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

const OFERTA_PAGA = {
  id: OFFER,
  partnerId: PARTNER,
  price: 100,
  hourlyRate: null,
  isActive: true,
  partner: {
    id: PARTNER,
    userId: 'prof-1',
    stripeAccountId: 'acct_1',
    chargesEnabled: true,
    commissionRate: 0.2,
    customCommissionRate: null,
    allowTestMode: false,
    tier: { commissionRate: 0.2, hourlyRatePolicy: 'base_only' },
  },
};

describe('SubscriptionsService', () => {
  let prisma: PrismaMock;
  let stripe: ReturnType<typeof stripeMock>;
  let notifications: ReturnType<typeof notificationsMock>;
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = prismaMock();
    stripe = stripeMock();
    notifications = notificationsMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new SubscriptionsService(prisma as any, stripe as any, notifications as any);

    prisma.partnerOffer.findUnique.mockResolvedValue(OFERTA_PAGA);
    prisma.partnerSubscription.create.mockResolvedValue({ id: 'sub-1' });
    prisma.partnerSubscription.findMany.mockResolvedValue([]);
    prisma.student.findFirst.mockResolvedValue(null);
    prisma.student.findMany.mockResolvedValue([]);
    prisma.systemSettings.findFirst.mockResolvedValue({ enableB2BTestMode: false });
    prisma.partnerAccount.findUnique.mockResolvedValue({ id: PARTNER, status: 'approved' });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D80 — leitura pura (corrige A80)
   * ────────────────────────────────────────────────────────────────────────── */

  describe('listar (D80, corrige A80)', () => {
    it('NUNCA chama o Stripe', async () => {
      prisma.partnerSubscription.findMany.mockResolvedValue([
        { id: 's1', status: 'active', stripeSubscriptionId: 'sub_real_1', offer: { partner: { user: {} } } },
      ]);

      await service.listar(EU);

      expect(stripe.recuperarSessaoDeCheckout).not.toHaveBeenCalled();
    });

    // As duas afirmações que provam que "leitura pura" não é acidente de mock:
    // o serviço não tem NENHUM caminho que escreve dentro de listar().
    it('NÃO atualiza status de nenhuma assinatura', async () => {
      prisma.partnerSubscription.findMany.mockResolvedValue([
        { id: 's1', status: 'active', stripeSubscriptionId: 'sub_real_1', offer: { partner: { user: {} } } },
      ]);
      await service.listar(EU);
      expect(prisma.partnerSubscription.update).not.toHaveBeenCalled();
    });

    it('NÃO cria notificação', async () => {
      await service.listar(EU);
      expect(notifications.criar).not.toHaveBeenCalled();
    });

    it('NÃO mexe em Student', async () => {
      await service.listar(EU);
      expect(prisma.student.update).not.toHaveBeenCalled();
      expect(prisma.student.updateMany).not.toHaveBeenCalled();
    });

    it('filtra por status ativo/relevante, do requisitante', async () => {
      await service.listar(EU);
      const { where } = prisma.partnerSubscription.findMany.mock.calls[0][0];
      expect(where).toEqual(
        expect.objectContaining({
          userId: EU,
          status: { in: ['active', 'canceling', 'trialing', 'past_due'] },
        }),
      );
    });

    // CONTROLE: prova que o método devolve dado de verdade, não um objeto vazio fixo.
    it('[controle] devolve as assinaturas encontradas', async () => {
      prisma.partnerSubscription.findMany.mockResolvedValue([{ id: 's1', status: 'active' }]);
      const r = await service.listar(EU);
      expect(r.subscriptions).toEqual([{ id: 's1', status: 'active' }]);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D78 — checkout confia no índice, não em findFirst (corrige A78)
   * ────────────────────────────────────────────────────────────────────────── */

  describe('checkout — plano pago (D78, corrige A78)', () => {
    it('NÃO consulta assinatura existente antes de criar a sessão de checkout', async () => {
      await service.checkout(OFFER, sessao(), {});

      // A propriedade central: nenhuma leitura de duplicata na frente do Stripe.
      // Quem decide duplicata é o índice, no create() do webhook/verify — não aqui.
      expect(prisma.partnerSubscription.findFirst).not.toHaveBeenCalled();
    });

    it('sem conta de recebimento configurada → 400', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        ...OFERTA_PAGA,
        partner: { ...OFERTA_PAGA.partner, chargesEnabled: false },
      });
      await expect(service.checkout(OFFER, sessao(), {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sem email nem sessão → 400', async () => {
      await expect(service.checkout(OFFER, null, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('[controle] com email no corpo, sem sessão (guest), segue', async () => {
      await expect(
        service.checkout(OFFER, null, { email: 'guest@example.com' }),
      ).resolves.toBeDefined();
    });

    it('cria a sessão com destination charge para a conta do profissional', async () => {
      await service.checkout(OFFER, sessao(), {});

      expect(stripe.criarSessaoDeCheckoutAssinatura).toHaveBeenCalledWith(
        expect.objectContaining({ destinoDaTransferencia: 'acct_1' }),
      );
    });

    it('oferta inativa → 404', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue(null);
      await expect(service.checkout(OFFER, sessao(), {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('checkout — oferta grátis', () => {
    const OFERTA_GRATIS = { ...OFERTA_PAGA, price: 0, hourlyRate: null };

    beforeEach(() => {
      prisma.partnerOffer.findUnique.mockResolvedValue(OFERTA_GRATIS);
    });

    it('exige sessão — guest não pode assinar grátis', async () => {
      // Precisa de email no corpo para passar da checagem de email (a MESMA do
      // legado, que roda antes de qualquer ramo) e alcançar o teste real: sem
      // userId, oferta grátis também exige sessão.
      await expect(
        service.checkout(OFFER, null, { email: 'guest@example.com' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    // A PROPRIEDADE: sem findFirst antes, o create pode falhar com P2002 — e
    // vira 409, não 500.
    it('duplicata (índice do D78) vira 409, não 500', async () => {
      prisma.partnerSubscription.create.mockRejectedValue(p2002());

      await expect(service.checkout(OFFER, sessao(), {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('[controle] sem duplicata, cria e devolve a assinatura', async () => {
      const r = await service.checkout(OFFER, sessao(), {});
      expect(r.subscription).toEqual(expect.objectContaining({ id: 'sub-1' }));
    });

    it('grava partnerId na assinatura — é o que o índice do D78 enxerga', async () => {
      await service.checkout(OFFER, sessao(), {});
      const { data } = prisma.partnerSubscription.create.mock.calls[0][0];
      expect(data.partnerId).toBe(PARTNER);
    });

    it('reconecta Student órfão do mesmo profissional', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 'student-1', userId: null });

      await service.checkout(OFFER, sessao(), {});

      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'student-1' } }),
      );
    });

    it('sem Student existente, cria um novo vinculado', async () => {
      await service.checkout(OFFER, sessao(), {});
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ trainerId: 'prof-1', userId: EU }) }),
      );
    });
  });

  describe('checkout — trial', () => {
    it('modo teste desligado globalmente → 403', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ enableB2BTestMode: false });
      await expect(
        service.checkout(OFFER, sessao(), { isTrial: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('profissional não habilitou modo teste → 403', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ enableB2BTestMode: true });
      prisma.partnerOffer.findUnique.mockResolvedValue({
        ...OFERTA_PAGA,
        partner: { ...OFERTA_PAGA.partner, allowTestMode: false },
      });
      await expect(
        service.checkout(OFFER, sessao(), { isTrial: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('[controle] modo teste ligado nos dois níveis → cria', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ enableB2BTestMode: true });
      prisma.partnerOffer.findUnique.mockResolvedValue({
        ...OFERTA_PAGA,
        partner: { ...OFERTA_PAGA.partner, allowTestMode: true },
      });
      await expect(service.checkout(OFFER, sessao(), { isTrial: true })).resolves.toBeDefined();
    });

    it('exige sessão', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ enableB2BTestMode: true });
      // O legado checa email ANTES de qualquer ramo — sem ele, guest levaria
      // 400, não 401. Com email presente, o 401 é especificamente "sem sessão".
      await expect(
        service.checkout(OFFER, null, { isTrial: true, email: 'guest@example.com' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A83 — guest checkout pula a checagem de duplicata (registrado, não
   * corrigido). O guest só grava linha no banco pelo caminho PAGO, via
   * `verificarCheckout()` — `checkout()` para grátis/trial exige sessão, igual
   * ao legado. É por isso que este teste chama `verificarCheckout`, não
   * `checkout`.
   * ────────────────────────────────────────────────────────────────────────── */

  describe('verificarCheckout — guest (A83, paridade deliberada)', () => {
    it('guest (userId=null) consegue criar — o índice do D78 só cobre userId NOT NULL', async () => {
      stripe.recuperarSessaoDeCheckout.mockResolvedValue({
        id: 'cs_guest', paymentStatus: 'paid',
        metadata: { type: 'b2b_subscription', offerId: OFFER, userId: 'guest' },
        subscriptionId: 'sub_stripe_guest', customerId: 'cus_guest', customerEmail: 'guest@example.com',
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue(null);

      const r = await service.verificarCheckout('cs_guest', sessao());

      expect(r.created).toBe(true);
      const { data } = prisma.partnerSubscription.create.mock.calls[0][0];
      expect(data.userId).toBeNull();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D81 — verify reconcilia com o webhook, não compete (corrige A81)
   * ────────────────────────────────────────────────────────────────────────── */

  describe('verificarCheckout (D81, corrige A81)', () => {
    beforeEach(() => {
      stripe.recuperarSessaoDeCheckout.mockResolvedValue({
        id: 'cs_1',
        paymentStatus: 'paid',
        metadata: { type: 'b2b_subscription', offerId: OFFER, userId: EU },
        subscriptionId: 'sub_stripe_1',
        customerId: 'cus_1',
        customerEmail: EU + '@example.com',
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue(null);
    });

    it('sem session_id → 400', async () => {
      await expect(service.verificarCheckout('', sessao())).rejects.toBeInstanceOf(BadRequestException);
    });

    it('pagamento não confirmado → created:false, sem criar nada', async () => {
      stripe.recuperarSessaoDeCheckout.mockResolvedValue({
        id: 'cs_1', paymentStatus: 'unpaid', metadata: {}, subscriptionId: null, customerId: null, customerEmail: null,
      });
      const r = await service.verificarCheckout('cs_1', sessao());
      expect(r.created).toBe(false);
      expect(prisma.partnerSubscription.create).not.toHaveBeenCalled();
    });

    it('já existe (idempotência) → created:false, alreadyExists:true', async () => {
      prisma.partnerSubscription.findUnique.mockResolvedValue({ id: 'sub-1' });
      const r = await service.verificarCheckout('cs_1', sessao());
      expect(r).toEqual(expect.objectContaining({ created: false, alreadyExists: true }));
    });

    // A PROPRIEDADE: o webhook cria primeiro (corrida vencida), o verify não
    // trata isso como erro — reconcilia e devolve sucesso igual.
    it('perder a corrida para o webhook (P2002) devolve sucesso, não 500', async () => {
      prisma.partnerSubscription.create.mockRejectedValue(p2002());
      prisma.partnerSubscription.findUnique
        .mockResolvedValueOnce(null) // checagem de idempotência, antes da corrida
        .mockResolvedValueOnce({ id: 'sub-do-webhook' }); // relido depois do P2002

      const r = await service.verificarCheckout('cs_1', sessao());

      expect(r.created).toBe(false);
      expect(r.alreadyExists).toBe(true);
    });

    it('[controle] ganhar a corrida cria de verdade', async () => {
      const r = await service.verificarCheckout('cs_1', sessao());
      expect(r.created).toBe(true);
      expect(prisma.partnerSubscription.create).toHaveBeenCalled();
    });

    it('metadata sem offerId → created:false, sem lançar', async () => {
      stripe.recuperarSessaoDeCheckout.mockResolvedValue({
        id: 'cs_1', paymentStatus: 'paid', metadata: { type: 'b2b_subscription' },
        subscriptionId: 'sub_1', customerId: 'cus_1', customerEmail: 'x@x.com',
      });
      const r = await service.verificarCheckout('cs_1', sessao());
      expect(r.created).toBe(false);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Cancelamento
   * ────────────────────────────────────────────────────────────────────────── */

  describe('cancelar', () => {
    beforeEach(() => {
      prisma.partnerSubscription.findUnique.mockResolvedValue({
        id: 'sub-1', userId: EU, status: 'active', stripeSubscriptionId: 'sub_real_1',
        offer: { partnerId: PARTNER, price: 100, hourlyRate: null, partner: { stripeAccountId: 'acct_1' } },
      });
    });

    it('assinatura de outro usuário → 404', async () => {
      prisma.partnerSubscription.findUnique.mockResolvedValue({
        id: 'sub-1', userId: 'outro-aluno', status: 'active', stripeSubscriptionId: 'sub_real_1',
        offer: { partnerId: PARTNER, partner: {} },
      });
      await expect(service.cancelar('sub-1', sessao(), {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cancelamento simples agenda no fim do período, não cancela na hora', async () => {
      await service.cancelar('sub-1', sessao(), {});

      expect(stripe.atualizarAssinatura).toHaveBeenCalledWith(
        'sub_real_1',
        { cancelAtPeriodEnd: true },
        'acct_1',
      );
      expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'canceling' } }),
      );
    });

    it('id local (free_/trial_) não chama o Stripe', async () => {
      prisma.partnerSubscription.findUnique.mockResolvedValue({
        id: 'sub-1', userId: EU, status: 'active', stripeSubscriptionId: 'free_abc',
        offer: { partnerId: PARTNER, partner: {} },
      });
      await service.cancelar('sub-1', sessao(), {});
      expect(stripe.atualizarAssinatura).not.toHaveBeenCalled();
    });

    describe('troca de plano', () => {
      const OFERTA_DESTINO_CARA = { id: 'offer-2', name: 'Premium', price: 200, hourlyRate: null, partnerId: PARTNER };
      const OFERTA_DESTINO_BARATA = { id: 'offer-2', name: 'Básico', price: 50, hourlyRate: null, partnerId: PARTNER };

      it('destino de outro profissional → 400', async () => {
        prisma.partnerOffer.findUnique.mockResolvedValue({ ...OFERTA_DESTINO_CARA, partnerId: 'outro-partner' });
        await expect(
          service.cancelar('sub-1', sessao(), { switchToOfferId: 'offer-2' }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('upgrade cancela imediatamente e pede novo checkout', async () => {
        prisma.partnerOffer.findUnique.mockResolvedValue(OFERTA_DESTINO_CARA);

        const r = await service.cancelar('sub-1', sessao(), { switchToOfferId: 'offer-2' });

        expect(stripe.cancelarAssinatura).toHaveBeenCalled();
        expect(r.requiresNewCheckout).toBe(true);
        expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ status: 'canceled' }) }),
        );
      });

      it('downgrade agenda para o fim do período, sem cancelar agora', async () => {
        prisma.partnerOffer.findUnique.mockResolvedValue(OFERTA_DESTINO_BARATA);

        const r = await service.cancelar('sub-1', sessao(), { switchToOfferId: 'offer-2' });

        expect(stripe.cancelarAssinatura).not.toHaveBeenCalled();
        expect(r.scheduled).toBe(true);
        expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'canceling', pendingOfferId: 'offer-2' }),
          }),
        );
      });
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Reativação
   * ────────────────────────────────────────────────────────────────────────── */

  describe('reativar', () => {
    beforeEach(() => {
      prisma.partnerSubscription.findUnique.mockResolvedValue({
        id: 'sub-1', userId: EU, status: 'canceling', stripeSubscriptionId: 'sub_real_1',
        offer: { partner: { stripeAccountId: 'acct_1' } },
      });
    });

    it('assinatura de outro usuário → 404', async () => {
      prisma.partnerSubscription.findUnique.mockResolvedValue({
        id: 'sub-1', userId: 'outro', status: 'canceling', stripeSubscriptionId: 'sub_real_1',
        offer: { partner: {} },
      });
      await expect(service.reativar('sub-1', sessao(), {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reverte cancel_at_period_end e volta para active', async () => {
      await service.reativar('sub-1', sessao(), {});

      expect(stripe.atualizarAssinatura).toHaveBeenCalledWith(
        'sub_real_1', { cancelAtPeriodEnd: false }, 'acct_1',
      );
      expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'active' }) }),
      );
    });

    it('clearPending também limpa pendingOfferId', async () => {
      await service.reativar('sub-1', sessao(), { clearPending: true });

      expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ pendingOfferId: null }) }),
      );
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Assinantes do parceiro
   * ────────────────────────────────────────────────────────────────────────── */

  describe('listarAssinantes', () => {
    it('cursor inválido → 400', async () => {
      await expect(
        service.listarAssinantes('prof-1', { cursor: 'nao-e-data' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('limita a 100 por página, no máximo', async () => {
      await service.listarAssinantes('prof-1', { limit: '9999' });
      expect(prisma.partnerSubscription.findMany.mock.calls[0][0].take).toBe(100);
    });
  });
});
