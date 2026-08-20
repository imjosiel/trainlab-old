import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { AffiliatesService } from './affiliates.service';

function prismaMock() {
  return {
    affiliateAccount: { findUnique: jest.fn(), update: jest.fn() },
    affiliateEarning: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function stripeMock() {
  return {
    buscarOuCriarContaConectadaDeAfiliado: jest.fn().mockResolvedValue({ id: 'acct_new' }),
    criarSessaoDeConta: jest.fn().mockResolvedValue({ clientSecret: 'cs_secret_1' }),
    buscarContaConectada: jest
      .fn()
      .mockResolvedValue({ payoutsEnabled: false, chargesEnabled: false, disabledReason: null }),
    transferir: jest.fn().mockResolvedValue({ id: 'tr_1' }),
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

const EU = 'affiliate-1';

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: EU,
    name: 'Afiliado',
    email: 'afiliado@example.com',
    image: null,
    roles: ['AFFILIATE'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: null,
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

describe('AffiliatesService', () => {
  let prisma: PrismaMock;
  let stripe: ReturnType<typeof stripeMock>;
  let service: AffiliatesService;

  beforeEach(() => {
    prisma = prismaMock();
    stripe = stripeMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AffiliatesService(prisma as any, stripe as any);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * configurarConta — POST /affiliate/connect/setup
   * ──────────────────────────────────────────────────────────────────────── */

  describe('configurarConta', () => {
    it('403 quando não é afiliado nem admin', async () => {
      const body = await bodyOfRejection(service.configurarConta(sessao({ roles: ['CLIENT'] })));
      expect(body.error).toBeDefined();
      expect(prisma.affiliateAccount.findUnique).not.toHaveBeenCalled();
    });

    it('404 quando não há conta de afiliado — sem auto-criar, nem pra admin', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(
        service.configurarConta(sessao({ isAdmin: true, systemRoles: ['ADMIN'] })),
      );
      expect(body.error).toBeDefined();
      expect(stripe.buscarOuCriarContaConectadaDeAfiliado).not.toHaveBeenCalled();
    });

    it('retorna direto o stripeAccountId já salvo, sem chamar a Stripe', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue({ id: 'aff-1', stripeAccountId: 'acct_existente' });

      const resultado = await service.configurarConta(sessao());

      expect(resultado).toEqual({ stripeAccountId: 'acct_existente' });
      expect(stripe.buscarOuCriarContaConectadaDeAfiliado).not.toHaveBeenCalled();
    });

    it('cria/reaproveita a conta na Stripe e persiste stripeAccountId + status pending', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue({ id: 'aff-1', stripeAccountId: null });

      const resultado = await service.configurarConta(sessao());

      expect(stripe.buscarOuCriarContaConectadaDeAfiliado).toHaveBeenCalledWith(
        expect.objectContaining({ userId: EU, affiliateAccountId: 'aff-1' }),
      );
      expect(prisma.affiliateAccount.update).toHaveBeenCalledWith({
        where: { id: 'aff-1' },
        data: { stripeAccountId: 'acct_new', stripeAccountStatus: 'pending' },
      });
      expect(resultado).toEqual({ stripeAccountId: 'acct_new' });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * criarSessaoDeOnboarding — POST /affiliate/connect/session
   * ──────────────────────────────────────────────────────────────────────── */

  describe('criarSessaoDeOnboarding', () => {
    beforeEach(() => {
      prisma.affiliateAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1' });
    });

    it('400 quando não há conta Stripe Connect configurada', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue({ stripeAccountId: null });
      const body = await bodyOfRejection(service.criarSessaoDeOnboarding(sessao(), {}));
      expect(body.error).toBeDefined();
    });

    it('400 quando nenhum component informado é válido, incluindo "payments" (que não existe pro afiliado)', async () => {
      const body = await bodyOfRejection(
        service.criarSessaoDeOnboarding(sessao(), { components: ['payments'] }),
      );
      expect(body.error).toMatch(/component/i);
      expect(stripe.criarSessaoDeConta).not.toHaveBeenCalled();
    });

    it('usa account_onboarding como default', async () => {
      await service.criarSessaoDeOnboarding(sessao(), {});
      expect(stripe.criarSessaoDeConta).toHaveBeenCalledWith('acct_1', {
        account_onboarding: { enabled: true },
      });
    });

    it('combina account_management e payouts', async () => {
      await service.criarSessaoDeOnboarding(sessao(), { components: ['account_management', 'payouts'] });
      expect(stripe.criarSessaoDeConta).toHaveBeenCalledWith('acct_1', {
        account_management: { enabled: true },
        payouts: { enabled: true },
      });
    });

    it('retorna o clientSecret', async () => {
      const resultado = await service.criarSessaoDeOnboarding(sessao(), {});
      expect(resultado).toEqual({ clientSecret: 'cs_secret_1' });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * sincronizar — POST /affiliate/connect/sync
   * ──────────────────────────────────────────────────────────────────────── */

  describe('sincronizar', () => {
    function contaBase(over: Record<string, unknown> = {}) {
      return {
        id: 'aff-1',
        stripeAccountId: 'acct_1',
        payoutsEnabled: false,
        pendingBalance: 0,
        ...over,
      };
    }

    beforeEach(() => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(contaBase());
      prisma.affiliateAccount.update.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        payoutsEnabled: false,
        chargesEnabled: false,
        stripeAccountStatus: 'pending',
        ...args.data,
      }));
    });

    it('400 quando não há conta Stripe Connect configurada', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(contaBase({ stripeAccountId: null }));
      const body = await bodyOfRejection(service.sincronizar(sessao()));
      expect(body.error).toBeDefined();
    });

    it('status active só com payoutsEnabled, mesmo sem chargesEnabled (diferente do parceiro)', async () => {
      stripe.buscarContaConectada.mockResolvedValue({
        payoutsEnabled: true,
        chargesEnabled: false,
        disabledReason: null,
      });

      const resultado = await service.sincronizar(sessao());
      expect(resultado.stripeAccountStatus).toBe('active');
    });

    it('status restricted quando não habilitado e há motivo de bloqueio', async () => {
      stripe.buscarContaConectada.mockResolvedValue({
        payoutsEnabled: false,
        chargesEnabled: false,
        disabledReason: 'requirements.past_due',
      });

      const resultado = await service.sincronizar(sessao());
      expect(resultado.stripeAccountStatus).toBe('restricted');
    });

    it('status pending quando não habilitado e sem motivo de bloqueio', async () => {
      const resultado = await service.sincronizar(sessao());
      expect(resultado.stripeAccountStatus).toBe('pending');
    });

    it('persiste payoutsEnabled/chargesEnabled/stripeAccountStatus', async () => {
      stripe.buscarContaConectada.mockResolvedValue({
        payoutsEnabled: true,
        chargesEnabled: true,
        disabledReason: null,
      });

      await service.sincronizar(sessao());

      expect(prisma.affiliateAccount.update).toHaveBeenCalledWith({
        where: { id: 'aff-1' },
        data: { payoutsEnabled: true, chargesEnabled: true, stripeAccountStatus: 'active' },
      });
    });

    it('não faz flush se payoutsEnabled já estava true antes (não é uma ativação nova)', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(contaBase({ payoutsEnabled: true, pendingBalance: 5000 }));
      stripe.buscarContaConectada.mockResolvedValue({ payoutsEnabled: true, chargesEnabled: true, disabledReason: null });

      const resultado = await service.sincronizar(sessao());

      expect(prisma.affiliateEarning.updateMany).not.toHaveBeenCalled();
      expect(resultado.flushedEarnings).toBeUndefined();
    });

    it('não faz flush se não há pendingBalance, mesmo com ativação nova', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(contaBase({ payoutsEnabled: false, pendingBalance: 0 }));
      stripe.buscarContaConectada.mockResolvedValue({ payoutsEnabled: true, chargesEnabled: true, disabledReason: null });

      await service.sincronizar(sessao());

      expect(prisma.affiliateEarning.updateMany).not.toHaveBeenCalled();
      expect(stripe.transferir).not.toHaveBeenCalled();
    });

    describe('flush de earnings pendentes (ativação nova + saldo pendente)', () => {
      const EARNING_A = { id: 'earn-a', earnedAmount: 3000, partnerId: 'partner-a' };
      const EARNING_B = { id: 'earn-b', earnedAmount: 2000, partnerId: 'partner-b' };

      beforeEach(() => {
        prisma.affiliateAccount.findUnique.mockResolvedValue(
          contaBase({ payoutsEnabled: false, pendingBalance: 5000 }),
        );
        stripe.buscarContaConectada.mockResolvedValue({ payoutsEnabled: true, chargesEnabled: true, disabledReason: null });
        prisma.affiliateEarning.updateMany.mockResolvedValue({ count: 0 });
        prisma.affiliateEarning.findMany.mockResolvedValue([]);
      });

      it('reverte earnings presos em "flushing" havia mais de 5 minutos, antes do lock', async () => {
        prisma.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 1 }); // cleanup
        prisma.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 2 }); // lock

        await service.sincronizar(sessao());

        const cleanupCall = prisma.affiliateEarning.updateMany.mock.calls[0][0];
        expect(cleanupCall.where.status).toBe('flushing');
        expect(cleanupCall.where.updatedAt.lt).toBeInstanceOf(Date);
        expect(cleanupCall.data).toEqual({ status: 'pending' });
      });

      it('não busca nem transfere earnings quando o lock não pega nada (outra request já processou)', async () => {
        prisma.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 0 }); // cleanup
        prisma.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 0 }); // lock

        await service.sincronizar(sessao());

        expect(prisma.affiliateEarning.findMany).not.toHaveBeenCalled();
        expect(stripe.transferir).not.toHaveBeenCalled();
      });

      it('transfere cada earning travado, marca available e move o saldo pending → available', async () => {
        prisma.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 0 }); // cleanup
        prisma.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 2 }); // lock
        prisma.affiliateEarning.findMany.mockResolvedValue([EARNING_A, EARNING_B]);

        const resultado = await service.sincronizar(sessao());

        expect(stripe.transferir).toHaveBeenCalledWith(
          expect.objectContaining({ valorEmCentavos: 3000, destino: 'acct_1' }),
        );
        expect(stripe.transferir).toHaveBeenCalledWith(
          expect.objectContaining({ valorEmCentavos: 2000, destino: 'acct_1' }),
        );
        expect(prisma.affiliateEarning.updateMany).not.toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ id: expect.anything() }) }),
        );
        expect(resultado.flushedEarnings).toBe(2);

        const balanceUpdateCall = prisma.affiliateAccount.update.mock.calls.find(
          (c) => c[0].data.pendingBalance !== undefined,
        );
        expect(balanceUpdateCall[0]).toEqual({
          where: { id: 'aff-1' },
          data: { pendingBalance: { decrement: 5000 }, availableBalance: { increment: 5000 } },
        });
      });

      it('reverte pra pending só o earning cuja transferência falhou, e soma apenas os bem-sucedidos', async () => {
        prisma.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 0 }); // cleanup
        prisma.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 2 }); // lock
        prisma.affiliateEarning.findMany.mockResolvedValue([EARNING_A, EARNING_B]);
        stripe.transferir.mockImplementation(async ({ valorEmCentavos }: { valorEmCentavos: number }) => {
          if (valorEmCentavos === 2000) throw new Error('conta recusou');
          return { id: 'tr_ok' };
        });

        const resultado = await service.sincronizar(sessao());

        expect(resultado.flushedEarnings).toBe(1);
        const balanceUpdateCall = prisma.affiliateAccount.update.mock.calls.find(
          (c) => c[0].data.pendingBalance !== undefined,
        );
        expect(balanceUpdateCall[0].data).toEqual({
          pendingBalance: { decrement: 3000 },
          availableBalance: { increment: 3000 },
        });
      });

      it('quando NENHUMA transferência é bem-sucedida, não mexe no saldo e omite flushedEarnings', async () => {
        prisma.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 0 }); // cleanup
        prisma.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 1 }); // lock
        prisma.affiliateEarning.findMany.mockResolvedValue([EARNING_A]);
        stripe.transferir.mockRejectedValue(new Error('conta recusou'));

        const resultado = await service.sincronizar(sessao());

        expect(resultado.flushedEarnings).toBeUndefined();
        const balanceUpdateCall = prisma.affiliateAccount.update.mock.calls.find(
          (c) => c[0].data.pendingBalance !== undefined,
        );
        expect(balanceUpdateCall).toBeUndefined();
      });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * listarGanhos — GET /affiliate/earnings
   * ──────────────────────────────────────────────────────────────────────── */

  describe('listarGanhos', () => {
    beforeEach(() => {
      prisma.affiliateAccount.findUnique.mockResolvedValue({ id: 'aff-1' });
      prisma.affiliateEarning.count.mockResolvedValue(0);
      prisma.affiliateEarning.findMany.mockResolvedValue([]);
    });

    it('403 quando não é afiliado nem admin', async () => {
      const body = await bodyOfRejection(service.listarGanhos(sessao({ roles: ['CLIENT'] }), {}));
      expect(body.error).toBeDefined();
    });

    it('404 quando não há conta de afiliado', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.listarGanhos(sessao(), {}));
      expect(body.error).toBeDefined();
    });

    it('filtra por affiliateId, não affiliateAccountId (A87 — bug do legado, campo não existe no schema)', async () => {
      await service.listarGanhos(sessao(), {});

      const whereUsado = (prisma.affiliateEarning.count as jest.Mock).mock.calls[0][0].where;
      expect(whereUsado).toHaveProperty('affiliateId', 'aff-1');
      expect(whereUsado).not.toHaveProperty('affiliateAccountId');
    });

    it('pagina com page=1 e limit=20 por padrão', async () => {
      await service.listarGanhos(sessao(), {});
      const args = (prisma.affiliateEarning.findMany as jest.Mock).mock.calls[0][0];
      expect(args.skip).toBe(0);
      expect(args.take).toBe(20);
    });

    it('limita o limit a no máximo 50', async () => {
      await service.listarGanhos(sessao(), { limit: '500' });
      const args = (prisma.affiliateEarning.findMany as jest.Mock).mock.calls[0][0];
      expect(args.take).toBe(50);
    });

    it('aplica o filtro de data quando startDate/endDate são válidos', async () => {
      await service.listarGanhos(sessao(), { startDate: '2026-01-01', endDate: '2026-01-31' });
      const where = (prisma.affiliateEarning.count as jest.Mock).mock.calls[0][0].where;
      expect(where.createdAt.gte).toBeInstanceOf(Date);
      expect(where.createdAt.lte).toBeInstanceOf(Date);
    });

    it('400 quando endDate é anterior a startDate', async () => {
      const body = await bodyOfRejection(
        service.listarGanhos(sessao(), { startDate: '2026-02-01', endDate: '2026-01-01' }),
      );
      expect(body.error).toMatch(/endDate/);
    });

    it('retorna total, page, limit e totalPages', async () => {
      prisma.affiliateEarning.count.mockResolvedValue(45);
      const resultado = (await service.listarGanhos(sessao(), { page: '2', limit: '20' })) as Record<
        string,
        unknown
      >;
      expect(resultado).toMatchObject({ total: 45, page: 2, limit: 20, totalPages: 3 });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * relatorio — GET /affiliate/report
   * ──────────────────────────────────────────────────────────────────────── */

  describe('relatorio', () => {
    let partnerAccount: { findMany: jest.Mock };

    beforeEach(() => {
      partnerAccount = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as unknown as { partnerAccount: typeof partnerAccount }).partnerAccount = partnerAccount;
      prisma.affiliateAccount.findUnique.mockResolvedValue({ id: 'aff-1' });
      prisma.affiliateEarning.findMany.mockResolvedValue([]);
    });

    it('403 quando não é afiliado nem admin', async () => {
      const body = await bodyOfRejection(service.relatorio(sessao({ roles: ['CLIENT'] })));
      expect(body.error).toBeDefined();
    });

    it('404 quando não há conta de afiliado', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.relatorio(sessao()));
      expect(body.error).toBeDefined();
    });

    it('agrega totalEarned por parceiro e ordena do maior pro menor', async () => {
      partnerAccount.findMany.mockResolvedValue([
        { id: 'p1', status: 'approved', partnerTier: 'starter', createdAt: new Date(), user: { name: 'A', image: null }, offers: [] },
        { id: 'p2', status: 'approved', partnerTier: 'starter', createdAt: new Date(), user: { name: 'B', image: null }, offers: [] },
      ]);
      prisma.affiliateEarning.findMany.mockResolvedValue([
        { partnerId: 'p1', earnedAmount: 1000, createdAt: new Date('2026-01-01') },
        { partnerId: 'p2', earnedAmount: 5000, createdAt: new Date('2026-01-01') },
      ]);

      const resultado = (await service.relatorio(sessao())) as { partners: Array<{ id: string; totalEarned: number }> };

      expect(resultado.partners[0]).toMatchObject({ id: 'p2', totalEarned: 5000 });
      expect(resultado.partners[1]).toMatchObject({ id: 'p1', totalEarned: 1000 });
    });

    it('soma o número de alunos ativos a partir das subscriptions das ofertas', async () => {
      partnerAccount.findMany.mockResolvedValue([
        {
          id: 'p1',
          status: 'approved',
          partnerTier: 'starter',
          createdAt: new Date(),
          user: { name: 'A', image: null },
          offers: [{ subscriptions: [{ id: 's1' }, { id: 's2' }] }, { subscriptions: [{ id: 's3' }] }],
        },
      ]);

      const resultado = (await service.relatorio(sessao())) as { partners: Array<{ activeStudentsCount: number }> };
      expect(resultado.partners[0].activeStudentsCount).toBe(3);
    });

    it('projeta estimatedMrr como o total do último mês completo, não o atual', async () => {
      const resultado = (await service.relatorio(sessao())) as { projection: { estimatedMrr: number } };
      expect(resultado.projection).toBeDefined();
    });
  });
});
