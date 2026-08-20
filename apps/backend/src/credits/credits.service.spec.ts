import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { CreditsService } from './credits.service';

function prismaMock() {
  return {
    systemSettings: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    userCredits: { findUnique: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
    creditTransaction: { findMany: jest.fn(), create: jest.fn() },
    creditPackage: { findMany: jest.fn(), findFirst: jest.fn() },
    partnerAccount: { findUnique: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function stripeMock() {
  return {
    criarSessaoDeCheckoutDeCreditos: jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' }),
  };
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

const EU = 'trainer-1';

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: EU,
    name: 'Treinador',
    email: 'treinador@example.com',
    image: null,
    roles: ['PROFESSIONAL'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: null,
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

const SETTINGS_LIGADO = { enableCreditSystem: true, creditCostPlanGen: 10, creditCostAiVideo: 50 };

describe('CreditsService', () => {
  let prisma: PrismaMock;
  let stripe: ReturnType<typeof stripeMock>;
  let service: CreditsService;

  beforeEach(() => {
    prisma = prismaMock();
    stripe = stripeMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new CreditsService(prisma as any, stripe as any);

    prisma.systemSettings.findFirst.mockResolvedValue(SETTINGS_LIGADO);
    prisma.user.findUnique.mockResolvedValue({ id: EU, roles: ['PROFESSIONAL'], subscription: null });
    prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 5, purchasedCredits: 3, lastResetAt: new Date() });
    prisma.creditTransaction.findMany.mockResolvedValue([]);
    prisma.partnerAccount.findUnique.mockResolvedValue(null);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * verSaldo — GET /credits
   * ──────────────────────────────────────────────────────────────────────── */

  describe('verSaldo', () => {
    it('quem não é treinador → { enabled: false }, sem tocar o banco', async () => {
      const r = await service.verSaldo(sessao({ roles: ['CLIENT'] }));
      expect(r).toEqual({ enabled: false });
      expect(prisma.systemSettings.findFirst).not.toHaveBeenCalled();
    });

    it('sistema de créditos desligado → { enabled: false }', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ ...SETTINGS_LIGADO, enableCreditSystem: false });
      const r = await service.verSaldo(sessao());
      expect(r).toEqual({ enabled: false });
    });

    it('usuário não encontrado → 404', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.verSaldo(sessao()));
      expect(body).toEqual({ error: 'Usuário não encontrado.' });
    });

    it('devolve saldo total, transações e custos', async () => {
      const r = (await service.verSaldo(sessao())) as Record<string, unknown>;
      expect(r).toMatchObject({
        enabled: true,
        planCredits: 5,
        purchasedCredits: 3,
        totalCredits: 8,
        costs: { planGen: 10, aiVideo: 50 },
      });
    });

    it('busca as últimas 20 transações, mais recentes primeiro', async () => {
      await service.verSaldo(sessao());
      expect(prisma.creditTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: EU }, orderBy: { createdAt: 'desc' }, take: 20 }),
      );
    });

    /* ── D87 — reset periódico só pelo caminho Partner/B2B ── */

    it('D87: sem PartnerAccount, não tenta resetar nada', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      await service.verSaldo(sessao());
      expect(prisma.userCredits.upsert).not.toHaveBeenCalled();
    });

    it('D87: parceiro sem creditsPerPeriod no tier, não reseta', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ tier: { creditsPerPeriod: null, creditResetPeriod: null } });
      await service.verSaldo(sessao());
      expect(prisma.userCredits.upsert).not.toHaveBeenCalled();
    });

    it('primeira vez (sem lastResetAt) + tier com creditsPerPeriod → concessão inicial', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        tier: { creditsPerPeriod: 100, creditResetPeriod: 'monthly' },
      });
      prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 0, purchasedCredits: 0, lastResetAt: null });

      await service.verSaldo(sessao());

      expect(prisma.userCredits.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: EU },
          create: expect.objectContaining({ planCredits: 100 }),
          update: expect.objectContaining({ planCredits: 100 }),
        }),
      );
      expect(prisma.creditTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'RESET' }) }),
      );
    });

    it('período mensal vencido (mês anterior) → reseta de novo', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        tier: { creditsPerPeriod: 50, creditResetPeriod: 'monthly' },
      });
      const mesPassado = new Date();
      mesPassado.setMonth(mesPassado.getMonth() - 1);
      prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 5, purchasedCredits: 0, lastResetAt: mesPassado });

      await service.verSaldo(sessao());
      expect(prisma.userCredits.upsert).toHaveBeenCalled();
    });

    it('[controle] período mensal ainda dentro do mês → não reseta', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        tier: { creditsPerPeriod: 50, creditResetPeriod: 'monthly' },
      });
      prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 5, purchasedCredits: 0, lastResetAt: new Date() });

      await service.verSaldo(sessao());
      expect(prisma.userCredits.upsert).not.toHaveBeenCalled();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * listarPacotesPublicos — GET /credits/packages
   * ──────────────────────────────────────────────────────────────────────── */

  describe('listarPacotesPublicos', () => {
    it('sistema desligado → pacotes vazio', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ enableCreditSystem: false });
      const r = await service.listarPacotesPublicos();
      expect(r).toEqual({ packages: [] });
      expect(prisma.creditPackage.findMany).not.toHaveBeenCalled();
    });

    it('lista só pacotes ativos, ordenados por créditos crescente', async () => {
      prisma.creditPackage.findMany.mockResolvedValue([{ id: 'pkg-1', name: 'Básico', credits: 100 }]);
      const r = (await service.listarPacotesPublicos()) as { packages: unknown[] };
      expect(prisma.creditPackage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true }, orderBy: { credits: 'asc' } }),
      );
      expect(r.packages).toHaveLength(1);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * gastar — preparo para training-plans (D88)
   * ──────────────────────────────────────────────────────────────────────── */

  describe('gastar', () => {
    beforeEach(() => {
      prisma.userCredits.updateMany.mockResolvedValue({ count: 1 });
    });

    it('sistema desligado → sucesso no-op, sem tocar créditos', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ enableCreditSystem: false });
      const r = await service.gastar({ userId: EU, cost: 10, feature: 'PLAN_GEN' });
      expect(r).toEqual({ success: true });
      expect(prisma.userCredits.updateMany).not.toHaveBeenCalled();
    });

    it('usuário não encontrado → falha sem lançar', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const r = await service.gastar({ userId: EU, cost: 10, feature: 'PLAN_GEN' });
      expect(r).toEqual({ success: false, error: 'Usuário não encontrado.' });
    });

    it('quem não é treinador → sucesso no-op', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: EU, roles: ['CLIENT'] });
      const r = await service.gastar({ userId: EU, cost: 10, feature: 'PLAN_GEN' });
      expect(r).toEqual({ success: true });
      expect(prisma.userCredits.updateMany).not.toHaveBeenCalled();
    });

    it('saldo insuficiente → falha com os números certos', async () => {
      prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 2, purchasedCredits: 1 });
      const r = await service.gastar({ userId: EU, cost: 10, feature: 'PLAN_GEN' });
      expect(r).toEqual({ success: false, error: 'Créditos insuficientes. Necessário: 10, disponível: 3.' });
    });

    it('débito sai do plan primeiro, quando é suficiente sozinho', async () => {
      prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 10, purchasedCredits: 5 });
      await service.gastar({ userId: EU, cost: 4, feature: 'PLAN_GEN' });
      expect(prisma.userCredits.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { planCredits: { decrement: 4 }, purchasedCredits: { decrement: 0 } } }),
      );
    });

    it('quando o plan não cobre tudo, cai no purchased como fallback', async () => {
      prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 3, purchasedCredits: 10 });
      await service.gastar({ userId: EU, cost: 8, feature: 'PLAN_GEN' });
      expect(prisma.userCredits.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { planCredits: { decrement: 3 }, purchasedCredits: { decrement: 5 } } }),
      );
    });

    /**
     * A90 — o desconto tem que ser RELATIVO. Um mock não modela concorrência,
     * então o que dá pra fixar aqui é a FORMA do comando: `decrement`, nunca um
     * absoluto derivado da leitura. A prova de que isso segura corrida de
     * verdade está no e2e contra Postgres (credits-corridas, janela alargada).
     */
    it('A90 — o débito é relativo (decrement), não um absoluto da leitura pré-débito', async () => {
      prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 10, purchasedCredits: 0 });
      await service.gastar({ userId: EU, cost: 5, feature: 'PLAN_GEN' });

      const { data } = prisma.userCredits.updateMany.mock.calls[0][0];
      expect(typeof data.planCredits).toBe('object');
      expect(data.planCredits).toEqual({ decrement: 5 });
    });

    it('A90 — o guard de saldo continua no where, junto do decrement', async () => {
      prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 3, purchasedCredits: 10 });
      await service.gastar({ userId: EU, cost: 8, feature: 'PLAN_GEN' });

      expect(prisma.userCredits.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: EU, planCredits: { gte: 3 }, purchasedCredits: { gte: 5 } },
        }),
      );
    });

    it('trava atômica: updateMany não encontra saldo suficiente (corrida) → falha', async () => {
      prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 10, purchasedCredits: 0 });
      prisma.userCredits.updateMany.mockResolvedValue({ count: 0 });
      const r = await service.gastar({ userId: EU, cost: 5, feature: 'PLAN_GEN' });
      expect(r).toEqual({ success: false, error: 'Créditos insuficientes (conflito de concorrência). Tente novamente.' });
    });

    it('sucesso devolve o novo saldo', async () => {
      prisma.userCredits.findUnique
        .mockResolvedValueOnce({ planCredits: 10, purchasedCredits: 5 }) // leitura pré-débito
        .mockResolvedValueOnce({ planCredits: 6, purchasedCredits: 5 }); // releitura pós-débito
      const r = await service.gastar({ userId: EU, cost: 4, feature: 'PLAN_GEN' });
      expect(r).toEqual({ success: true, newBalance: 11, planCredits: 6, purchasedCredits: 5 });
    });

    /**
     * A90 — o saldo reportado vem da releitura, não da conta feita sobre a
     * leitura pré-débito. Sob concorrência as duas divergem: o segundo débito
     * reportaria o saldo do primeiro. Aqui a releitura devolve um valor que a
     * conta antiga (10-4=6) nunca produziria, então só passa quem relê.
     */
    it('A90 — o saldo devolvido vem da releitura pós-débito, não da conta sobre a leitura velha', async () => {
      prisma.userCredits.findUnique
        .mockResolvedValueOnce({ planCredits: 10, purchasedCredits: 5 })
        .mockResolvedValueOnce({ planCredits: 2, purchasedCredits: 5 }); // outro débito passou no meio
      const r = await service.gastar({ userId: EU, cost: 4, feature: 'PLAN_GEN' });
      expect(r).toEqual({ success: true, newBalance: 7, planCredits: 2, purchasedCredits: 5 });
    });

    it('débito misto grava duas transações de auditoria (parte plano + parte comprados)', async () => {
      prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 3, purchasedCredits: 10 });
      await service.gastar({ userId: EU, cost: 8, feature: 'PLAN_GEN' });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({}),
        expect.objectContaining({}),
      ]);
    });

    it('falha ao gravar a auditoria não derruba a operação (débito já aplicado)', async () => {
      prisma.userCredits.findUnique.mockResolvedValue({ planCredits: 10, purchasedCredits: 5 });
      prisma.$transaction.mockRejectedValue(new Error('banco de auditoria fora do ar'));
      const r = await service.gastar({ userId: EU, cost: 4, feature: 'PLAN_GEN' });
      expect(r.success).toBe(true);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * conceder — POST /admin/credits/grant
   * ──────────────────────────────────────────────────────────────────────── */

  describe('conceder', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-alvo' });
      prisma.userCredits.upsert.mockResolvedValue({ planCredits: 100, purchasedCredits: 0 });
    });

    it('usuário inexistente → 404', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.conceder({ userId: 'fantasma', amount: 50 }));
      expect(body).toEqual({ error: 'Usuário não encontrado.' });
    });

    it('bucket padrão é plan quando não informado', async () => {
      await service.conceder({ userId: 'user-alvo', amount: 50 });
      expect(prisma.userCredits.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { planCredits: { increment: 50 } } }),
      );
    });

    it('bucket purchased quando informado', async () => {
      await service.conceder({ userId: 'user-alvo', amount: 50, bucket: 'purchased' });
      expect(prisma.userCredits.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { purchasedCredits: { increment: 50 } } }),
      );
    });

    it('registra a transação GRANT com o autor da concessão', async () => {
      await service.conceder({ userId: 'user-alvo', amount: 50, grantedById: 'admin-1' });
      expect(prisma.creditTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'GRANT', grantedById: 'admin-1' }) }),
      );
    });

    it('devolve o saldo atualizado', async () => {
      prisma.userCredits.upsert.mockResolvedValue({ planCredits: 150, purchasedCredits: 20 });
      const r = await service.conceder({ userId: 'user-alvo', amount: 50 });
      expect(r).toEqual({ newBalance: 170, planCredits: 150, purchasedCredits: 20 });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * registrarCompra — porte de addPurchasedCredits (fatia 20, chamado pelo webhook)
   * ──────────────────────────────────────────────────────────────────────── */

  describe('registrarCompra', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-alvo' });
      prisma.userCredits.upsert.mockResolvedValue({ planCredits: 0, purchasedCredits: 100 });
    });

    it('usuário inexistente → 404', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(
        service.registrarCompra({ userId: 'fantasma', amount: 100, packageId: 'pkg-1' }),
      );
      expect(body).toEqual({ error: 'Usuário não encontrado.' });
    });

    it('incrementa purchasedCredits via upsert atômico (nunca mexe em planCredits)', async () => {
      await service.registrarCompra({ userId: 'user-alvo', amount: 100, packageId: 'pkg-1' });
      expect(prisma.userCredits.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-alvo' },
          create: { userId: 'user-alvo', purchasedCredits: 100 },
          update: { purchasedCredits: { increment: 100 } },
        }),
      );
    });

    it('registra a transação tipo PURCHASE, bucket purchased, feature com o pacote', async () => {
      await service.registrarCompra({ userId: 'user-alvo', amount: 100, packageId: 'pkg-1', description: 'Compra: Básico' });
      expect(prisma.creditTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'PURCHASE',
            bucket: 'purchased',
            feature: 'package:pkg-1',
            description: 'Compra: Básico',
          }),
        }),
      );
    });

    it('[controle] sem packageId, feature fica null', async () => {
      await service.registrarCompra({ userId: 'user-alvo', amount: 100 });
      expect(prisma.creditTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ feature: null }) }),
      );
    });

    it('devolve o saldo atualizado', async () => {
      const r = await service.registrarCompra({ userId: 'user-alvo', amount: 100, packageId: 'pkg-1' });
      expect(r).toEqual({ newBalance: 100, planCredits: 0, purchasedCredits: 100 });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * criarCheckout — POST /stripe/checkout-credits (fatia 19)
   * ──────────────────────────────────────────────────────────────────────── */

  describe('criarCheckout', () => {
    const PACOTE = { id: 'pkg-1', name: 'Pacote Básico', credits: 100, price: 19.9, priceUsd: null, stripePriceId: null };

    const NEXTAUTH_URL_ORIGINAL = process.env.NEXTAUTH_URL;

    beforeEach(() => {
      process.env.NEXTAUTH_URL = 'https://app.example.com';
      prisma.creditPackage.findFirst.mockResolvedValue(PACOTE);
    });

    afterEach(() => {
      if (NEXTAUTH_URL_ORIGINAL === undefined) delete process.env.NEXTAUTH_URL;
      else process.env.NEXTAUTH_URL = NEXTAUTH_URL_ORIGINAL;
    });

    it('sem packageId → 400', async () => {
      const body = await bodyOfRejection(service.criarCheckout(sessao(), {}));
      expect(body).toEqual({ error: 'packageId é obrigatório.' });
    });

    it('sistema de créditos desligado → 403', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ enableCreditSystem: false });
      const body = await bodyOfRejection(service.criarCheckout(sessao(), { packageId: 'pkg-1' }));
      expect(body).toEqual({ error: 'Sistema de créditos desativado.' });
    });

    it('pacote não encontrado ou inativo → 404', async () => {
      prisma.creditPackage.findFirst.mockResolvedValue(null);
      const body = await bodyOfRejection(service.criarCheckout(sessao(), { packageId: 'pkg-x' }));
      expect(body).toEqual({ error: 'Pacote não encontrado ou inativo.' });
    });

    it('busca o pacote com isActive:true explícito no where (não filtro pós-leitura)', async () => {
      await service.criarCheckout(sessao(), { packageId: 'pkg-1' });
      expect(prisma.creditPackage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pkg-1', isActive: true } }),
      );
    });

    it('sem NEXTAUTH_URL configurado → 500, sem tentar criar sessão na Stripe', async () => {
      delete process.env.NEXTAUTH_URL;
      const body = await bodyOfRejection(service.criarCheckout(sessao(), { packageId: 'pkg-1' }));
      expect(body).toEqual({ error: 'Configuração do servidor incompleta. Contate o suporte.' });
      expect(stripe.criarSessaoDeCheckoutDeCreditos).not.toHaveBeenCalled();
    });

    it('moeda BRL usa o price padrão', async () => {
      await service.criarCheckout(sessao(), { packageId: 'pkg-1', currency: 'brl' });
      expect(stripe.criarSessaoDeCheckoutDeCreditos).toHaveBeenCalledWith(
        expect.objectContaining({ unitAmountEmCentavos: 1990 }),
      );
    });

    it('moeda USD com priceUsd configurado usa priceUsd', async () => {
      prisma.creditPackage.findFirst.mockResolvedValue({ ...PACOTE, priceUsd: 4.99 });
      await service.criarCheckout(sessao(), { packageId: 'pkg-1', currency: 'usd' });
      expect(stripe.criarSessaoDeCheckoutDeCreditos).toHaveBeenCalledWith(
        expect.objectContaining({ unitAmountEmCentavos: 499 }),
      );
    });

    it('[controle] moeda USD sem priceUsd configurado cai pro price (BRL) como fallback', async () => {
      await service.criarCheckout(sessao(), { packageId: 'pkg-1', currency: 'usd' });
      expect(stripe.criarSessaoDeCheckoutDeCreditos).toHaveBeenCalledWith(
        expect.objectContaining({ unitAmountEmCentavos: 1990 }),
      );
    });

    it('D92: usa stripeCustomerId da sessão quando disponível, sem consultar User.subscription', async () => {
      await service.criarCheckout(sessao({ stripeCustomerId: 'cus_existente' }), { packageId: 'pkg-1' });
      expect(stripe.criarSessaoDeCheckoutDeCreditos).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cus_existente' }),
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('sem stripeCustomerId, usa o email do usuário', async () => {
      await service.criarCheckout(sessao({ stripeCustomerId: null, email: 'aluno@example.com' }), { packageId: 'pkg-1' });
      expect(stripe.criarSessaoDeCheckoutDeCreditos).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: undefined, customerEmail: 'aluno@example.com' }),
      );
    });

    it('metadata identifica o tipo, o comprador, o pacote e a quantidade de créditos', async () => {
      await service.criarCheckout(sessao(), { packageId: 'pkg-1' });
      expect(stripe.criarSessaoDeCheckoutDeCreditos).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { type: 'credit_purchase', userId: EU, packageId: 'pkg-1', credits: '100' },
        }),
      );
    });

    it('devolve a url da sessão criada', async () => {
      const r = await service.criarCheckout(sessao(), { packageId: 'pkg-1' });
      expect(r).toEqual({ url: 'https://checkout.stripe.com/cs_1' });
    });
  });
});
