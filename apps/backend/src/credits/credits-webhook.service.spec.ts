import { BadRequestException } from '@nestjs/common';

import { CreditsWebhookService } from './credits-webhook.service';

function prismaMock() {
  return {
    creditPackage: { findUnique: jest.fn() },
    userSubscription: { upsert: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function stripeMock() {
  return { verificarAssinatura: jest.fn() };
}

function claimsMock() {
  return {
    reivindicar: jest.fn().mockResolvedValue('reivindicado'),
    concluir: jest.fn().mockResolvedValue(undefined),
    liberar: jest.fn().mockResolvedValue(undefined),
  };
}

function creditsMock() {
  return {
    registrarCompra: jest.fn().mockResolvedValue({ newBalance: 100, planCredits: 0, purchasedCredits: 100 }),
  };
}

const EVENTO_COMPRA = {
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_1',
      customer: 'cus_1',
      metadata: { type: 'credit_purchase', userId: 'user-1', packageId: 'pkg-1' },
    },
  },
};

describe('CreditsWebhookService', () => {
  let prisma: PrismaMock;
  let stripe: ReturnType<typeof stripeMock>;
  let claims: ReturnType<typeof claimsMock>;
  let credits: ReturnType<typeof creditsMock>;
  let service: CreditsWebhookService;

  beforeEach(() => {
    prisma = prismaMock();
    stripe = stripeMock();
    claims = claimsMock();
    credits = creditsMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new CreditsWebhookService(prisma as any, stripe as any, claims as any, credits as any);

    stripe.verificarAssinatura.mockReturnValue(EVENTO_COMPRA);
    prisma.creditPackage.findUnique.mockResolvedValue({ id: 'pkg-1', name: 'Pacote Básico', credits: 100 });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * Envelope — assinatura e reivindicação (D75, mesmo esqueleto do B2B)
   * ──────────────────────────────────────────────────────────────────────── */

  describe('processarWebhook — envelope', () => {
    it('assinatura inválida → 400, sem tentar reivindicar nada', async () => {
      stripe.verificarAssinatura.mockImplementation(() => {
        throw new Error('assinatura não bate');
      });
      await expect(service.processarWebhook('corpo', 'sig-ruim')).rejects.toBeInstanceOf(BadRequestException);
      expect(claims.reivindicar).not.toHaveBeenCalled();
    });

    it('usa STRIPE_WEBHOOK_SECRET_CREDITS, não o do B2B', async () => {
      const original = process.env.STRIPE_WEBHOOK_SECRET_CREDITS;
      process.env.STRIPE_WEBHOOK_SECRET_CREDITS = 'whsec_creditos_teste';
      try {
        await service.processarWebhook('corpo', 'sig');
        expect(stripe.verificarAssinatura).toHaveBeenCalledWith('corpo', 'sig', 'whsec_creditos_teste');
      } finally {
        if (original === undefined) delete process.env.STRIPE_WEBHOOK_SECRET_CREDITS;
        else process.env.STRIPE_WEBHOOK_SECRET_CREDITS = original;
      }
    });

    it('evento já em andamento → cached, sem processar de novo', async () => {
      claims.reivindicar.mockResolvedValue('em_andamento');
      const r = await service.processarWebhook('corpo', 'sig');
      expect(r).toEqual({ received: true, cached: true });
      expect(credits.registrarCompra).not.toHaveBeenCalled();
    });

    it('evento já concluído → cached, sem reprocessar', async () => {
      claims.reivindicar.mockResolvedValue('ja_processado');
      const r = await service.processarWebhook('corpo', 'sig');
      expect(r).toEqual({ received: true, cached: true });
      expect(credits.registrarCompra).not.toHaveBeenCalled();
    });

    it('reivindicado → processa e conclui', async () => {
      await service.processarWebhook('corpo', 'sig');
      expect(claims.concluir).toHaveBeenCalledWith('credits:evt_1');
    });

    it('falha no processamento libera o claim e sobe o erro', async () => {
      credits.registrarCompra.mockRejectedValue(new Error('banco fora do ar'));
      await expect(service.processarWebhook('corpo', 'sig')).rejects.toThrow('banco fora do ar');
      expect(claims.liberar).toHaveBeenCalledWith('credits:evt_1');
      expect(claims.concluir).not.toHaveBeenCalled();
    });

    it('[controle] sucesso não libera o claim', async () => {
      await service.processarWebhook('corpo', 'sig');
      expect(claims.liberar).not.toHaveBeenCalled();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * checkout.session.completed — credit_purchase
   * ──────────────────────────────────────────────────────────────────────── */

  describe('checkout.session.completed', () => {
    it('chama registrarCompra com userId, créditos do pacote e packageId', async () => {
      await service.processarWebhook('corpo', 'sig');
      expect(credits.registrarCompra).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', amount: 100, packageId: 'pkg-1' }),
      );
    });

    it('com session.customer, grava o stripeCustomerId em UserSubscription', async () => {
      await service.processarWebhook('corpo', 'sig');
      expect(prisma.userSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          create: { userId: 'user-1', stripeCustomerId: 'cus_1' },
          update: { stripeCustomerId: 'cus_1' },
        }),
      );
    });

    it('sem session.customer, não mexe em UserSubscription', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        ...EVENTO_COMPRA,
        data: { object: { ...EVENTO_COMPRA.data.object, customer: null } },
      });
      await service.processarWebhook('corpo', 'sig');
      expect(prisma.userSubscription.upsert).not.toHaveBeenCalled();
    });

    it('metadata sem userId → ignora sem lançar (D94: no-op esperado, não falha)', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        ...EVENTO_COMPRA,
        data: { object: { ...EVENTO_COMPRA.data.object, metadata: { type: 'credit_purchase', packageId: 'pkg-1' } } },
      });
      await expect(service.processarWebhook('corpo', 'sig')).resolves.toBeDefined();
      expect(credits.registrarCompra).not.toHaveBeenCalled();
      expect(claims.concluir).toHaveBeenCalled();
    });

    it('metadata sem packageId → ignora sem lançar', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        ...EVENTO_COMPRA,
        data: { object: { ...EVENTO_COMPRA.data.object, metadata: { type: 'credit_purchase', userId: 'user-1' } } },
      });
      await expect(service.processarWebhook('corpo', 'sig')).resolves.toBeDefined();
      expect(credits.registrarCompra).not.toHaveBeenCalled();
    });

    it('pacote não encontrado (apagado depois da compra?) → ignora sem lançar', async () => {
      prisma.creditPackage.findUnique.mockResolvedValue(null);
      await expect(service.processarWebhook('corpo', 'sig')).resolves.toBeDefined();
      expect(credits.registrarCompra).not.toHaveBeenCalled();
      expect(claims.concluir).toHaveBeenCalled();
    });

    it('checkout.session.completed de outro tipo (b2b_subscription) é ignorado aqui', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_2',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_2', metadata: { type: 'b2b_subscription' } } },
      });
      await service.processarWebhook('corpo', 'sig');
      expect(credits.registrarCompra).not.toHaveBeenCalled();
      expect(claims.concluir).toHaveBeenCalled();
    });

    it('tipo de evento diferente é ignorado, não é erro', async () => {
      stripe.verificarAssinatura.mockReturnValue({ id: 'evt_3', type: 'charge.refunded', data: { object: {} } });
      await service.processarWebhook('corpo', 'sig');
      expect(credits.registrarCompra).not.toHaveBeenCalled();
      expect(claims.concluir).toHaveBeenCalled();
    });
  });
});
