import { AffiliateCommissionService } from './affiliate-commission.service';

function p2002() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

const AFILIADO = {
  id: 'aff-1',
  userId: 'user-aff',
  customCommissionRate: null,
  status: 'approved', // valor REAL do schema — ver A77
  stripeAccountId: 'acct_aff',
  payoutsEnabled: true,
};

const OFERTA = {
  id: 'offer-1',
  price: 100, // reais
  partner: {
    id: 'pa-1',
    affiliatedBy: AFILIADO,
    tier: { affiliateCommissionRate: 0.1 },
  },
};

function prismaMock() {
  const tx = {
    affiliateEarning: { update: jest.fn() },
    affiliateAccount: { update: jest.fn() },
  };
  return {
    tx,
    partnerOffer: { findUnique: jest.fn() },
    affiliateEarning: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    affiliateAccount: { update: jest.fn() },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
}

function stripeMock() {
  return { transferir: jest.fn().mockResolvedValue({ id: 'tr_1' }) };
}

function notificationsMock() {
  return { criar: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
}

const ASSINATURA = { id: 'sub-1', offerId: 'offer-1' };
const FATURA = { id: 'in_1', amountPaid: 10000 };

describe('AffiliateCommissionService (D76/D77, corrige A75 e A76)', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let stripe: ReturnType<typeof stripeMock>;
  let notifications: ReturnType<typeof notificationsMock>;
  let service: AffiliateCommissionService;

  beforeEach(() => {
    prisma = prismaMock();
    stripe = stripeMock();
    notifications = notificationsMock();
    service = new AffiliateCommissionService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stripe as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notifications as any,
    );

    prisma.partnerOffer.findUnique.mockResolvedValue(OFERTA);
    prisma.affiliateEarning.create.mockResolvedValue({ id: 'earn-1' });
    prisma.affiliateEarning.update.mockResolvedValue({ id: 'earn-1' });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A75 — a ORDEM. É a propriedade que define esta fatia.
   * ────────────────────────────────────────────────────────────────────────── */

  describe('ordem das operações (D76)', () => {
    it('reserva o earning ANTES de transferir', async () => {
      const ordem: string[] = [];
      prisma.affiliateEarning.create.mockImplementation(async () => {
        ordem.push('reserva');
        return { id: 'earn-1' };
      });
      stripe.transferir.mockImplementation(async () => {
        ordem.push('transferencia');
        return { id: 'tr_1' };
      });

      await service.processar(ASSINATURA, FATURA);

      // No legado a ordem era ['transferencia', 'reserva'] — e era isso que
      // deixava a @@unique guardando a razão em vez da transferência.
      expect(ordem).toEqual(['reserva', 'transferencia']);
    });

    // A propriedade mais importante do arquivo: reserva perdida ⇒ dinheiro NÃO sai.
    it('P2002 na reserva ⇒ NENHUMA transferência', async () => {
      prisma.affiliateEarning.create.mockRejectedValue(p2002());

      const r = await service.processar(ASSINATURA, FATURA);

      expect(stripe.transferir).not.toHaveBeenCalled();
      expect(r).toEqual({ situacao: 'ja_processada' });
    });

    // CONTROLE do teste acima: sem ele, um serviço que nunca transferisse
    // passaria. Prova que o caminho feliz transfere de verdade.
    it('[controle] reserva nova ⇒ transfere uma vez', async () => {
      await service.processar(ASSINATURA, FATURA);

      expect(stripe.transferir).toHaveBeenCalledTimes(1);
    });

    it('a reserva usa invoiceId e affiliateId — é a chave que trava', async () => {
      await service.processar(ASSINATURA, FATURA);

      const { data } = prisma.affiliateEarning.create.mock.calls[0][0];
      expect(data).toEqual(
        expect.objectContaining({ invoiceId: FATURA.id, affiliateId: AFILIADO.id }),
      );
    });

    it('a linha reservada nasce num status que não parece paga', async () => {
      await service.processar(ASSINATURA, FATURA);

      const { data } = prisma.affiliateEarning.create.mock.calls[0][0];
      expect(data.status).toBe('reserving');
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A corrida real do A75: dois eventos DIFERENTES do Stripe
   * ────────────────────────────────────────────────────────────────────────── */

  describe('checkout.session.completed e invoice.payment_succeeded em paralelo', () => {
    it('transfere UMA vez só, mesmo com os dois chamando junto', async () => {
      const reservados = new Set<string>();
      prisma.affiliateEarning.create.mockImplementation(async ({ data }: never) => {
        const chave = `${(data as { invoiceId: string }).invoiceId}`;
        if (reservados.has(chave)) throw p2002();
        reservados.add(chave);
        return { id: 'earn-1' };
      });

      await Promise.all([
        service.processar(ASSINATURA, FATURA),
        service.processar(ASSINATURA, FATURA),
      ]);

      // No legado, os dois passavam pelo findFirst e os dois transferiam.
      expect(stripe.transferir).toHaveBeenCalledTimes(1);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Resultado da transferência
   * ────────────────────────────────────────────────────────────────────────── */

  describe('desfecho', () => {
    it('transferência ok ⇒ available e saldo disponível', async () => {
      const r = await service.processar(ASSINATURA, FATURA);

      expect(r).toEqual(expect.objectContaining({ situacao: 'registrada', status: 'available' }));
      expect(prisma.tx.affiliateAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { availableBalance: { increment: expect.any(Number) } },
        }),
      );
    });

    it('transferência falha ⇒ pending e saldo pendente, sem perder a comissão', async () => {
      stripe.transferir.mockRejectedValue(new Error('conta do afiliado recusou'));

      const r = await service.processar(ASSINATURA, FATURA);

      expect(r).toEqual(expect.objectContaining({ situacao: 'registrada', status: 'pending' }));
      expect(prisma.tx.affiliateAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { pendingBalance: { increment: expect.any(Number) } },
        }),
      );
    });

    it('sem Stripe Connect ⇒ nem tenta transferir, e fica pendente', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        ...OFERTA,
        partner: { ...OFERTA.partner, affiliatedBy: { ...AFILIADO, payoutsEnabled: false } },
      });

      const r = await service.processar(ASSINATURA, FATURA);

      expect(stripe.transferir).not.toHaveBeenCalled();
      expect(r).toEqual(expect.objectContaining({ status: 'pending' }));
    });

    it('afiliado suspenso ⇒ reserved, sem transferir e sem mexer em saldo', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        ...OFERTA,
        partner: { ...OFERTA.partner, affiliatedBy: { ...AFILIADO, status: 'suspended' } },
      });

      const r = await service.processar(ASSINATURA, FATURA);

      expect(stripe.transferir).not.toHaveBeenCalled();
      expect(r).toEqual(expect.objectContaining({ status: 'reserved' }));
      expect(prisma.tx.affiliateAccount.update).not.toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Cálculo
   * ────────────────────────────────────────────────────────────────────────── */

  describe('cálculo do valor', () => {
    it('a comissão incide sobre o preço BASE da oferta, não sobre o total pago', async () => {
      // price 100 reais = 10000 centavos, taxa 10% ⇒ 1000 centavos.
      // A fatura veio com amountPaid 10000, e o legado guarda isso como
      // grossAmount — mas a base do cálculo é a oferta.
      await service.processar(ASSINATURA, FATURA);

      const { data } = prisma.affiliateEarning.create.mock.calls[0][0];
      expect(data.baseAmount).toBe(10000);
      expect(data.earnedAmount).toBe(1000);
      expect(data.commissionRate).toBe(0.1);
    });

    it('customCommissionRate do afiliado tem precedência sobre a do tier', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        ...OFERTA,
        partner: { ...OFERTA.partner, affiliatedBy: { ...AFILIADO, customCommissionRate: 0.25 } },
      });

      await service.processar(ASSINATURA, FATURA);

      const { data } = prisma.affiliateEarning.create.mock.calls[0][0];
      expect(data.commissionRate).toBe(0.25);
      expect(data.earnedAmount).toBe(2500);
    });

    it('taxa zero ⇒ nada é reservado nem transferido', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        ...OFERTA,
        partner: {
          ...OFERTA.partner,
          affiliatedBy: { ...AFILIADO, customCommissionRate: 0 },
          tier: { affiliateCommissionRate: 0 },
        },
      });

      await service.processar(ASSINATURA, FATURA);

      expect(prisma.affiliateEarning.create).not.toHaveBeenCalled();
      expect(stripe.transferir).not.toHaveBeenCalled();
    });

    it('oferta sem afiliado ⇒ não faz nada', async () => {
      prisma.partnerOffer.findUnique.mockResolvedValue({
        ...OFERTA,
        partner: { ...OFERTA.partner, affiliatedBy: null },
      });

      const r = await service.processar(ASSINATURA, FATURA);

      expect(r).toEqual({ situacao: 'sem_afiliado' });
      expect(prisma.affiliateEarning.create).not.toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D77 — nada de catch mudo em dinheiro
   * ────────────────────────────────────────────────────────────────────────── */

  describe('erros sobem (D77, corrige A76)', () => {
    it('falha de banco na reserva NÃO vira log silencioso', async () => {
      prisma.affiliateEarning.create.mockRejectedValue(new Error('conexão caiu'));

      await expect(service.processar(ASSINATURA, FATURA)).rejects.toThrow('conexão caiu');
    });

    it('falha ao gravar o desfecho sobe', async () => {
      prisma.$transaction.mockRejectedValue(new Error('deadlock'));

      await expect(service.processar(ASSINATURA, FATURA)).rejects.toThrow('deadlock');
    });

    // CONTROLE: prova que nem todo erro sobe — falha de transferência é
    // esperada e vira `pending`, não exceção.
    it('[controle] falha de transferência NÃO sobe — é desfecho previsto', async () => {
      stripe.transferir.mockRejectedValue(new Error('conta recusou'));

      await expect(service.processar(ASSINATURA, FATURA)).resolves.toBeDefined();
    });
  });

  describe('aviso ao afiliado', () => {
    it('notifica quando a comissão entra', async () => {
      await service.processar(ASSINATURA, FATURA);

      expect(notifications.criar).toHaveBeenCalledWith(
        expect.objectContaining({ userId: AFILIADO.userId, type: 'AFFILIATE_COMMISSION' }),
      );
    });

    it('a notificação não derruba o registro da comissão', async () => {
      notifications.criar.mockRejectedValue(new Error('sino fora do ar'));

      await expect(service.processar(ASSINATURA, FATURA)).resolves.toEqual(
        expect.objectContaining({ situacao: 'registrada' }),
      );
    });
  });
});
