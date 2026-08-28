import { BadRequestException } from '@nestjs/common';

import { B2BWebhookService } from './b2b-webhook.service';

function prismaMock() {
  return {
    partnerSubscription: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    partnerOffer: { findUnique: jest.fn() },
    student: { findFirst: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
    notification: { findFirst: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function stripeMock() {
  return {
    verificarAssinatura: jest.fn(),
    cancelarAssinatura: jest.fn().mockResolvedValue(undefined),
    recuperarAssinatura: jest.fn(),
  };
}

function claimsMock() {
  return {
    reivindicar: jest.fn().mockResolvedValue('reivindicado'),
    concluir: jest.fn().mockResolvedValue(undefined),
    liberar: jest.fn().mockResolvedValue(undefined),
  };
}

function comissoesMock() {
  return { processar: jest.fn().mockResolvedValue({ situacao: 'registrada', status: 'available' }) };
}

function notificationsMock() {
  return { criar: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
}

const EVENTO_CHECKOUT = {
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_1',
      subscription: 'sub_stripe_1',
      customer: 'cus_1',
      invoice: null,
      metadata: { type: 'b2b_subscription', offerId: 'offer-1', userId: 'aluno-1' },
      customer_details: { email: 'aluno@example.com' },
    },
  },
};

describe('B2BWebhookService', () => {
  let prisma: PrismaMock;
  let stripe: ReturnType<typeof stripeMock>;
  let claims: ReturnType<typeof claimsMock>;
  let comissoes: ReturnType<typeof comissoesMock>;
  let notifications: ReturnType<typeof notificationsMock>;
  let service: B2BWebhookService;

  beforeEach(() => {
    prisma = prismaMock();
    stripe = stripeMock();
    claims = claimsMock();
    comissoes = comissoesMock();
    notifications = notificationsMock();
    service = new B2BWebhookService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stripe as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      claims as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      comissoes as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notifications as any,
    );

    stripe.verificarAssinatura.mockReturnValue(EVENTO_CHECKOUT);
    prisma.partnerSubscription.findUnique.mockResolvedValue(null);
    prisma.partnerSubscription.create.mockResolvedValue({ id: 'sub-1' });
    prisma.partnerOffer.findUnique.mockResolvedValue({
      id: 'offer-1', partnerId: 'pa-1', price: 100, hourlyRate: null,
      partner: { userId: 'prof-1' },
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Assinatura e reivindicação — o esqueleto do D75, aplicado ao dispatcher
   * ────────────────────────────────────────────────────────────────────────── */

  describe('processarWebhook — envelope', () => {
    it('assinatura inválida → 400, sem tentar reivindicar nada', async () => {
      stripe.verificarAssinatura.mockImplementation(() => {
        throw new Error('assinatura não bate');
      });

      await expect(service.processarWebhook('corpo', 'assinatura-ruim')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(claims.reivindicar).not.toHaveBeenCalled();
    });

    it('evento já em andamento (D75) → responde cached, sem processar de novo', async () => {
      claims.reivindicar.mockResolvedValue('em_andamento');

      const r = await service.processarWebhook('corpo', 'sig');

      expect(r).toEqual({ received: true, cached: true });
      expect(prisma.partnerSubscription.create).not.toHaveBeenCalled();
    });

    it('evento já concluído (D75) → responde cached, sem reprocessar', async () => {
      claims.reivindicar.mockResolvedValue('ja_processado');

      const r = await service.processarWebhook('corpo', 'sig');

      expect(r).toEqual({ received: true, cached: true });
      expect(prisma.partnerSubscription.create).not.toHaveBeenCalled();
    });

    it('reivindicado → processa e conclui', async () => {
      await service.processarWebhook('corpo', 'sig');

      expect(claims.concluir).toHaveBeenCalledWith('b2b:evt_1');
    });

    // O par que fecha o D75 no dispatcher: falha no processamento LIBERA o
    // claim, para o Stripe poder reentregar.
    it('falha no processamento libera o claim e sobe o erro', async () => {
      prisma.partnerOffer.findUnique.mockRejectedValue(new Error('banco fora do ar'));

      await expect(service.processarWebhook('corpo', 'sig')).rejects.toThrow('banco fora do ar');

      expect(claims.liberar).toHaveBeenCalledWith('b2b:evt_1');
      expect(claims.concluir).not.toHaveBeenCalled();
    });

    // CONTROLE: sucesso NÃO libera o claim — senão o Stripe reprocessaria
    // eventos que já deram certo.
    it('[controle] sucesso não libera o claim', async () => {
      await service.processarWebhook('corpo', 'sig');
      expect(claims.liberar).not.toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * checkout.session.completed
   * ────────────────────────────────────────────────────────────────────────── */

  describe('checkout.session.completed', () => {
    it('cria a assinatura quando ainda não existe', async () => {
      await service.processarWebhook('corpo', 'sig');

      expect(prisma.partnerSubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stripeSubscriptionId: 'sub_stripe_1', partnerId: 'pa-1' }),
        }),
      );
    });

    it('idempotente: se já existe, atualiza em vez de tentar criar de novo', async () => {
      prisma.partnerSubscription.findUnique.mockResolvedValue({ id: 'sub-1', email: 'x@x.com' });

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.partnerSubscription.create).not.toHaveBeenCalled();
      expect(prisma.partnerSubscription.update).toHaveBeenCalled();
    });

    it('cria vínculo Student quando há userId e ainda não existe', async () => {
      await service.processarWebhook('corpo', 'sig');
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ trainerId: 'prof-1', userId: 'aluno-1' }) }),
      );
    });

    it('não duplica Student quando já existe', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 'student-1' });
      await service.processarWebhook('corpo', 'sig');
      expect(prisma.student.create).not.toHaveBeenCalled();
    });

    // D76 aplicado aqui: o checkout chama a comissão como rede de segurança
    // quando a sessão já tem invoice — mas SÓ se o `partnerSub` existir.
    it('com invoice presente, processa comissão de afiliado como rede de segurança', async () => {
      const eventoComInvoice = {
        ...EVENTO_CHECKOUT,
        data: { object: { ...EVENTO_CHECKOUT.data.object, invoice: 'in_1' } },
      };
      stripe.verificarAssinatura.mockReturnValue(eventoComInvoice);
      prisma.partnerSubscription.findUnique
        .mockResolvedValueOnce(null) // checagem de existência antes de criar
        .mockResolvedValueOnce({ id: 'sub-1', offerId: 'offer-1' }); // releitura p/ comissão

      await service.processarWebhook('corpo', 'sig');

      expect(comissoes.processar).toHaveBeenCalled();
    });

    it('sem invoice, não tenta comissão', async () => {
      await service.processarWebhook('corpo', 'sig');
      expect(comissoes.processar).not.toHaveBeenCalled();
    });

    it('offerId ausente no metadata → ignora sem lançar', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        ...EVENTO_CHECKOUT,
        data: { object: { ...EVENTO_CHECKOUT.data.object, metadata: { type: 'b2b_subscription' } } },
      });
      await expect(service.processarWebhook('corpo', 'sig')).resolves.toBeDefined();
      expect(prisma.partnerSubscription.create).not.toHaveBeenCalled();
    });

    it('evento de tipo diferente (b2c, credit_purchase) é ignorado, não processado aqui', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_2', type: 'checkout.session.completed',
        data: { object: { id: 'cs_2', metadata: { type: 'credit_purchase' } } },
      });

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.partnerSubscription.create).not.toHaveBeenCalled();
      // Mesmo ignorando, o evento é reivindicado e concluído — não é erro.
      expect(claims.concluir).toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * customer.subscription.updated / deleted
   * ────────────────────────────────────────────────────────────────────────── */

  describe('customer.subscription.updated', () => {
    // A86 — o status vem de uma RELEITURA na Stripe (`recuperarAssinatura`),
    // não do campo `status` do payload do evento. O payload continua
    // existindo (é dele que sai o `id`), mas o retrato que ele carrega pode
    // estar desatualizado — ver descrição completa no describe do A86 abaixo.
    it('preserva canceling quando a Stripe confirma active+cancelAtPeriodEnd', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_3', type: 'customer.subscription.updated',
        data: { object: { id: 'sub_stripe_1', status: 'active', cancel_at_period_end: true } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue({ id: 'sub-1', status: 'canceling' });
      stripe.recuperarAssinatura.mockResolvedValue({ status: 'active', cancelAtPeriodEnd: true });

      await service.processarWebhook('corpo', 'sig');

      expect(stripe.recuperarAssinatura).toHaveBeenCalledWith('sub_stripe_1');
      expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'canceling' } }),
      );
    });

    it('[controle] sem cancelAtPeriodEnd, aplica o status que a Stripe confirmou', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_4', type: 'customer.subscription.updated',
        data: { object: { id: 'sub_stripe_1', status: 'past_due', cancel_at_period_end: false } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue({ id: 'sub-1', status: 'active' });
      stripe.recuperarAssinatura.mockResolvedValue({ status: 'past_due', cancelAtPeriodEnd: false });

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'past_due' } }),
      );
    });

    it('assinatura desconhecida (sem PartnerSubscription local) é ignorada, sem nem perguntar pra Stripe', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_5', type: 'customer.subscription.updated',
        data: { object: { id: 'sub_desconhecida', status: 'active', cancel_at_period_end: false } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue(null);

      await expect(service.processarWebhook('corpo', 'sig')).resolves.toBeDefined();
      expect(stripe.recuperarAssinatura).not.toHaveBeenCalled();
      expect(prisma.partnerSubscription.update).not.toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A86 — achado ao testar um checkout real: `customer.subscription.created` e
   * `customer.subscription.updated` chegaram no MESMO segundo, mas em ordem
   * trocada. O `created` carrega o retrato de ANTES do pagamento confirmar
   * (`incomplete`) — e chegou DEPOIS do `updated`, que já tinha `active`. O
   * Stripe não garante ordem de entrega entre eventos diferentes do mesmo
   * objeto, e o handler antigo confiava cegamente em quem chegasse por
   * último. Resultado real, reproduzido: banco ficava `incomplete` para uma
   * assinatura que a própria Stripe já mostrava `active`.
   *
   * Correção: religa para a Stripe e usa o status ATUAL, não o do payload.
   * Elimina a corrida em vez de tentar ordená-la — não depende de comparar
   * timestamps (que no Stripe só têm resolução de segundo, e podem empatar,
   * como empataram aqui).
   * ────────────────────────────────────────────────────────────────────────── */
  describe('customer.subscription.created/updated fora de ordem (A86)', () => {
    it('created chega depois do updated, com status desatualizado → usa o estado real da Stripe', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_14', type: 'customer.subscription.created',
        data: { object: { id: 'sub_stripe_1', status: 'incomplete', cancel_at_period_end: false } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue({ id: 'sub-1', status: 'active' });
      stripe.recuperarAssinatura.mockResolvedValue({ status: 'active', cancelAtPeriodEnd: false });

      await service.processarWebhook('corpo', 'sig');

      expect(stripe.recuperarAssinatura).toHaveBeenCalledWith('sub_stripe_1');
      expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'active' } }),
      );
    });

    it('[controle] created chega primeiro, sem corrida → aplica o que a Stripe confirma', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_15', type: 'customer.subscription.created',
        data: { object: { id: 'sub_stripe_1', status: 'incomplete', cancel_at_period_end: false } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue({ id: 'sub-1', status: 'incomplete' });
      stripe.recuperarAssinatura.mockResolvedValue({ status: 'incomplete', cancelAtPeriodEnd: false });

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'incomplete' } }),
      );
    });
  });

  describe('customer.subscription.deleted', () => {
    it('marca canceled', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_6', type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_stripe_1' } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue({ id: 'sub-1', pendingOfferId: null, userId: null });

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'canceled' } }),
      );
    });

    it('com downgrade agendado, notifica o aluno', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_7', type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_stripe_1' } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue({
        id: 'sub-1', pendingOfferId: 'offer-2', userId: 'aluno-1',
      });
      prisma.partnerOffer.findUnique.mockResolvedValue({ id: 'offer-2', name: 'Básico' });

      await service.processarWebhook('corpo', 'sig');

      expect(notifications.criar).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'aluno-1', type: 'PLAN_DOWNGRADE_READY' }),
      );
    });

    it('sem downgrade agendado, não notifica', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_8', type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_stripe_1' } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue({ id: 'sub-1', pendingOfferId: null, userId: 'aluno-1' });

      await service.processarWebhook('corpo', 'sig');

      expect(notifications.criar).not.toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * invoice.payment_succeeded / failed
   * ────────────────────────────────────────────────────────────────────────── */

  describe('invoice.payment_succeeded', () => {
    it('marca active e processa comissão de afiliado', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_9', type: 'invoice.payment_succeeded',
        data: { object: { id: 'in_1', subscription: 'sub_stripe_1', amount_paid: 10000 } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue({
        id: 'sub-1', status: 'active', offerId: 'offer-1',
      });

      await service.processarWebhook('corpo', 'sig');

      expect(comissoes.processar).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sub-1', offerId: 'offer-1' }),
        expect.objectContaining({ id: 'in_1' }),
      );
    });

    it('preserva canceling — renovação paga não desfaz downgrade agendado', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_10', type: 'invoice.payment_succeeded',
        data: { object: { id: 'in_2', subscription: 'sub_stripe_1', amount_paid: 10000 } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue({
        id: 'sub-1', status: 'canceling', offerId: 'offer-1',
      });

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'canceling' } }),
      );
    });

    it('invoice avulsa (sem subscription) é ignorada', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_11', type: 'invoice.payment_succeeded',
        data: { object: { id: 'in_3', subscription: null, amount_paid: 5000 } },
      });

      await expect(service.processarWebhook('corpo', 'sig')).resolves.toBeDefined();
      expect(comissoes.processar).not.toHaveBeenCalled();
    });
  });

  describe('invoice.payment_failed', () => {
    it('marca past_due e notifica o aluno', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_12', type: 'invoice.payment_failed',
        data: { object: { id: 'in_4', subscription: 'sub_stripe_1' } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue({ id: 'sub-1', userId: 'aluno-1' });

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.partnerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'past_due' } }),
      );
      expect(notifications.criar).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'aluno-1', type: 'PAYMENT_FAILED' }),
      );
    });

    it('sem userId vinculado, não notifica', async () => {
      stripe.verificarAssinatura.mockReturnValue({
        id: 'evt_13', type: 'invoice.payment_failed',
        data: { object: { id: 'in_5', subscription: 'sub_stripe_1' } },
      });
      prisma.partnerSubscription.findUnique.mockResolvedValue({ id: 'sub-1', userId: null });

      await service.processarWebhook('corpo', 'sig');

      expect(notifications.criar).not.toHaveBeenCalled();
    });
  });
});
