import { BadRequestException } from '@nestjs/common';

import { WebhookConnectService } from './webhook-connect.service';

function prismaMock() {
  return {
    partnerTier: { findUnique: jest.fn() },
    partnerAccount: { findUnique: jest.fn(), update: jest.fn() },
    affiliateAccount: { findUnique: jest.fn(), update: jest.fn() },
    partnerTierRequest: { create: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function stripeMock() {
  return {
    verificarAssinatura: jest.fn(),
    buscarCharge: jest.fn(),
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
  return { reverter: jest.fn().mockResolvedValue({ earningsRevertidos: 0 }) };
}

function notificationsMock() {
  return { criar: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
}

function evento(over: Record<string, unknown>) {
  return { id: 'evt_1', type: 'default_ignorado', data: { object: {} }, ...over };
}

describe('WebhookConnectService', () => {
  let prisma: PrismaMock;
  let stripe: ReturnType<typeof stripeMock>;
  let claims: ReturnType<typeof claimsMock>;
  let comissoes: ReturnType<typeof comissoesMock>;
  let notifications: ReturnType<typeof notificationsMock>;
  let service: WebhookConnectService;

  beforeEach(() => {
    prisma = prismaMock();
    stripe = stripeMock();
    claims = claimsMock();
    comissoes = comissoesMock();
    notifications = notificationsMock();
    service = new WebhookConnectService(
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

    stripe.verificarAssinatura.mockReturnValue(evento({}));
  });

  /* ────────────────────────────────────────────────────────────────────────
   * envelope — mesmo padrão do B2BWebhookService (D75)
   * ──────────────────────────────────────────────────────────────────────── */

  describe('processarWebhook — envelope', () => {
    it('assinatura inválida → 400, sem tentar reivindicar', async () => {
      stripe.verificarAssinatura.mockImplementation(() => {
        throw new Error('assinatura não bate');
      });
      await expect(service.processarWebhook('corpo', 'sig-ruim')).rejects.toBeInstanceOf(BadRequestException);
      expect(claims.reivindicar).not.toHaveBeenCalled();
    });

    it('em_andamento → cached, sem processar', async () => {
      claims.reivindicar.mockResolvedValue('em_andamento');
      const r = await service.processarWebhook('corpo', 'sig');
      expect(r).toEqual({ received: true, cached: true });
    });

    it('ja_processado → cached, sem processar', async () => {
      claims.reivindicar.mockResolvedValue('ja_processado');
      const r = await service.processarWebhook('corpo', 'sig');
      expect(r).toEqual({ received: true, cached: true });
    });

    it('reivindicado → processa e conclui', async () => {
      const r = await service.processarWebhook('corpo', 'sig');
      expect(r).toEqual({ received: true });
      expect(claims.concluir).toHaveBeenCalledWith('connect:evt_1');
    });

    it('falha no processamento libera o claim e sobe o erro', async () => {
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'account.updated', data: { object: { id: 'acct_1' } } }),
      );
      prisma.partnerAccount.findUnique.mockRejectedValue(new Error('banco fora do ar'));

      await expect(service.processarWebhook('corpo', 'sig')).rejects.toThrow('banco fora do ar');
      expect(claims.liberar).toHaveBeenCalledWith('connect:evt_1');
    });

    it('tipo de evento não tratado → ignora, sem erro', async () => {
      stripe.verificarAssinatura.mockReturnValue(evento({ type: 'customer.created' }));
      const r = await service.processarWebhook('corpo', 'sig');
      expect(r).toEqual({ received: true });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * tier pago — checkout.session.completed e customer.subscription.*
   * ──────────────────────────────────────────────────────────────────────── */

  describe('tier pago do parceiro', () => {
    const METADATA_TIER = {
      type: 'partner_tier_payment',
      partnerId: 'partner-1',
      fromTierId: 'tier-starter',
      toTierId: 'tier-pro',
      toTierSlug: 'pro',
    };
    const TIER_PRO = { id: 'tier-pro', slug: 'pro', name: 'Pro', commissionRate: 0.5 };

    beforeEach(() => {
      prisma.partnerTier.findUnique.mockResolvedValue(TIER_PRO);
      prisma.partnerAccount.findUnique.mockResolvedValue({ tierId: 'tier-starter' });
    });

    it('checkout.session.completed com type diferente de partner_tier_payment → ignora', async () => {
      stripe.verificarAssinatura.mockReturnValue(
        evento({
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_1', metadata: { type: 'b2b_subscription' } } },
        }),
      );
      await service.processarWebhook('corpo', 'sig');
      expect(prisma.partnerTier.findUnique).not.toHaveBeenCalled();
    });

    it('checkout.session.completed com partner_tier_payment → atualiza o tier', async () => {
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: METADATA_TIER } } }),
      );
      await service.processarWebhook('corpo', 'sig');
      expect(prisma.partnerAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'partner-1' },
          data: { tierId: 'tier-pro', partnerTier: 'pro', commissionRate: 0.5 },
        }),
      );
    });

    it('customer.subscription.updated com partner_tier_payment → mesmo efeito', async () => {
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', metadata: METADATA_TIER } } }),
      );
      await service.processarWebhook('corpo', 'sig');
      expect(prisma.partnerAccount.update).toHaveBeenCalled();
    });

    it('customer.subscription.updated de outra origem (sem metadata de tier) → ignora, sem erro', async () => {
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', metadata: {} } } }),
      );
      await expect(service.processarWebhook('corpo', 'sig')).resolves.toEqual({ received: true });
      expect(prisma.partnerTier.findUnique).not.toHaveBeenCalled();
    });

    it('metadata incompleto (falta toTierSlug) → não busca nem atualiza nada', async () => {
      stripe.verificarAssinatura.mockReturnValue(
        evento({
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_1', metadata: { type: 'partner_tier_payment', partnerId: 'p1', toTierId: 't1' } } },
        }),
      );
      await service.processarWebhook('corpo', 'sig');
      expect(prisma.partnerTier.findUnique).not.toHaveBeenCalled();
    });

    it('tier de destino não encontrado → não atualiza nada', async () => {
      prisma.partnerTier.findUnique.mockResolvedValue(null);
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: METADATA_TIER } } }),
      );
      await service.processarWebhook('corpo', 'sig');
      expect(prisma.partnerAccount.update).not.toHaveBeenCalled();
    });

    it('idempotência: já está no tier de destino → não atualiza de novo', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ tierId: 'tier-pro' });
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: METADATA_TIER } } }),
      );
      await service.processarWebhook('corpo', 'sig');
      expect(prisma.partnerAccount.update).not.toHaveBeenCalled();
    });

    it('cria PartnerTierRequest auto_approved com a origem no note', async () => {
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: METADATA_TIER } } }),
      );
      await service.processarWebhook('corpo', 'sig');
      expect(prisma.partnerTierRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            partnerId: 'partner-1', fromTierId: 'tier-starter', toTierId: 'tier-pro', status: 'auto_approved',
          }),
        }),
      );
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * sync de Connect — account.updated
   * ──────────────────────────────────────────────────────────────────────── */

  describe('account.updated', () => {
    function contaEvento(over: Record<string, unknown> = {}) {
      return evento({
        type: 'account.updated',
        data: { object: { id: 'acct_1', payouts_enabled: true, charges_enabled: true, requirements: {}, ...over } },
      });
    }

    it('acha como PartnerAccount → atualiza status/payouts/charges', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', userId: 'u1', stripeAccountStatus: 'pending' });
      stripe.verificarAssinatura.mockReturnValue(contaEvento());

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.partnerAccount.update).toHaveBeenCalledWith({
        where: { id: 'pa-1' },
        data: { stripeAccountStatus: 'active', payoutsEnabled: true, chargesEnabled: true },
      });
    });

    it('PartnerAccount vira active pela primeira vez → notifica', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', userId: 'u1', stripeAccountStatus: 'pending' });
      stripe.verificarAssinatura.mockReturnValue(contaEvento());

      await service.processarWebhook('corpo', 'sig');

      expect(notifications.criar).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', type: 'CONNECT_ACCOUNT_ACTIVE' }));
    });

    it('PartnerAccount já estava active → não notifica de novo', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', userId: 'u1', stripeAccountStatus: 'active' });
      stripe.verificarAssinatura.mockReturnValue(contaEvento());

      await service.processarWebhook('corpo', 'sig');

      expect(notifications.criar).not.toHaveBeenCalled();
    });

    it('PartnerAccount com payoutsEnabled mas SEM chargesEnabled → não é active (parceiro exige os dois)', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', userId: 'u1', stripeAccountStatus: 'pending' });
      stripe.verificarAssinatura.mockReturnValue(contaEvento({ payouts_enabled: true, charges_enabled: false }));

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.partnerAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stripeAccountStatus: 'pending' }) }),
      );
      expect(notifications.criar).not.toHaveBeenCalled();
    });

    it('não acha como PartnerAccount, acha como AffiliateAccount → atualiza payoutsEnabled', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      prisma.affiliateAccount.findUnique.mockResolvedValue({ id: 'aff-1', userId: 'u2', payoutsEnabled: false, stripeAccountStatus: 'pending' });
      stripe.verificarAssinatura.mockReturnValue(contaEvento());

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.affiliateAccount.update).toHaveBeenCalledWith({
        where: { id: 'aff-1' },
        data: { stripeAccountStatus: 'active', payoutsEnabled: true, chargesEnabled: true },
      });
    });

    it('não acha em nenhuma das duas → não quebra, não atualiza nada', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      prisma.affiliateAccount.findUnique.mockResolvedValue(null);
      stripe.verificarAssinatura.mockReturnValue(contaEvento());

      await expect(service.processarWebhook('corpo', 'sig')).resolves.toEqual({ received: true });
      expect(prisma.partnerAccount.update).not.toHaveBeenCalled();
      expect(prisma.affiliateAccount.update).not.toHaveBeenCalled();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * sync de Connect — account.application.deauthorized
   * ──────────────────────────────────────────────────────────────────────── */

  describe('account.application.deauthorized', () => {
    function desautorizacaoEvento() {
      return evento({ type: 'account.application.deauthorized', account: 'acct_1', data: { object: { id: 'ca_x' } } });
    }

    it('acha como PartnerAccount → reseta os campos de Connect', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', userId: 'u1' });
      stripe.verificarAssinatura.mockReturnValue(desautorizacaoEvento());

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.partnerAccount.update).toHaveBeenCalledWith({
        where: { id: 'pa-1' },
        data: { stripeAccountStatus: 'not_started', stripeAccountId: null, payoutsEnabled: false, chargesEnabled: false },
      });
      expect(notifications.criar).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', type: 'CONNECT_ACCOUNT_DEAUTHORIZED' }));
    });

    it('acha como AffiliateAccount → reseta os campos de Connect', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      prisma.affiliateAccount.findUnique.mockResolvedValue({ id: 'aff-1', userId: 'u2' });
      stripe.verificarAssinatura.mockReturnValue(desautorizacaoEvento());

      await service.processarWebhook('corpo', 'sig');

      expect(prisma.affiliateAccount.update).toHaveBeenCalledWith({
        where: { id: 'aff-1' },
        data: { stripeAccountId: null, stripeAccountStatus: 'not_started', payoutsEnabled: false, chargesEnabled: false },
      });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * reembolso — charge.refunded e application_fee.refunded
   * ──────────────────────────────────────────────────────────────────────── */

  describe('reembolso', () => {
    it('charge.refunded delega pro AffiliateCommissionService.reverter com o invoiceId', async () => {
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'charge.refunded', data: { object: { id: 'ch_1', invoice: 'in_1' } } }),
      );
      await service.processarWebhook('corpo', 'sig');
      expect(comissoes.reverter).toHaveBeenCalledWith('in_1');
    });

    it('charge.refunded sem invoice (pagamento avulso) → não chama reverter', async () => {
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'charge.refunded', data: { object: { id: 'ch_1', invoice: null } } }),
      );
      await service.processarWebhook('corpo', 'sig');
      expect(comissoes.reverter).not.toHaveBeenCalled();
    });

    it('application_fee.refunded busca a charge e delega pro reverter com o invoiceId dela', async () => {
      stripe.buscarCharge.mockResolvedValue({ id: 'ch_1', invoiceId: 'in_1' });
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'application_fee.refunded', data: { object: { id: 'fee_1', charge: 'ch_1' } } }),
      );
      await service.processarWebhook('corpo', 'sig');
      expect(stripe.buscarCharge).toHaveBeenCalledWith('ch_1');
      expect(comissoes.reverter).toHaveBeenCalledWith('in_1');
    });

    it('application_fee.refunded cuja charge não tem invoice → não chama reverter', async () => {
      stripe.buscarCharge.mockResolvedValue({ id: 'ch_1', invoiceId: null });
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'application_fee.refunded', data: { object: { id: 'fee_1', charge: 'ch_1' } } }),
      );
      await service.processarWebhook('corpo', 'sig');
      expect(comissoes.reverter).not.toHaveBeenCalled();
    });

    /**
     * D77 já estabeleceu a política pra esse mesmo domínio: erro em processamento
     * de dinheiro NÃO é engolido em silêncio (era o que causava A76 — comissão
     * que some sem ninguém perceber). O legado engolia aqui
     * (`handleChargeRefunded` com try/catch mudo); não é comportamento a repetir.
     * A falha sobe, o envelope libera o claim, e a Stripe reentrega.
     */
    it('D77 aplicado ao reembolso — falha em reverter() SOBE, não é engolida; claim libera pra reentrega', async () => {
      comissoes.reverter.mockRejectedValue(new Error('Stripe fora do ar'));
      stripe.verificarAssinatura.mockReturnValue(
        evento({ type: 'charge.refunded', data: { object: { id: 'ch_1', invoice: 'in_1' } } }),
      );
      await expect(service.processarWebhook('corpo', 'sig')).rejects.toThrow('Stripe fora do ar');
      expect(claims.liberar).toHaveBeenCalledWith('connect:evt_1');
    });
  });
});
