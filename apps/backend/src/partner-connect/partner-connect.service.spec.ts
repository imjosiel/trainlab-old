import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { PartnerConnectService } from './partner-connect.service';

function prismaMock() {
  return {
    systemSettings: { findFirst: jest.fn() },
    partnerAccount: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    partnerTier: { findFirst: jest.fn() },
    user: { update: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function notificationsMock() {
  return { criar: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
}

function stripeMock() {
  return {
    buscarOuCriarContaConectada: jest.fn().mockResolvedValue({ id: 'acct_new' }),
    criarSessaoDeConta: jest.fn().mockResolvedValue({ clientSecret: 'cs_secret_1' }),
    buscarContaConectada: jest
      .fn()
      .mockResolvedValue({ payoutsEnabled: false, chargesEnabled: false, disabledReason: null }),
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

const EU = 'partner-1';

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

const ADMINS = [{ id: 'admin-1' }, { id: 'admin-2' }];

describe('PartnerConnectService', () => {
  let prisma: PrismaMock;
  let notifications: ReturnType<typeof notificationsMock>;
  let stripe: ReturnType<typeof stripeMock>;
  let service: PartnerConnectService;

  beforeEach(() => {
    prisma = prismaMock();
    notifications = notificationsMock();
    stripe = stripeMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new PartnerConnectService(prisma as any, notifications as any, stripe as any);

    prisma.systemSettings.findFirst.mockResolvedValue({ autoApprovePartners: false });
    prisma.partnerAccount.findUnique.mockResolvedValue(null);
    prisma.partnerTier.findFirst.mockResolvedValue({ id: 'tier-starter', slug: 'starter' });
    prisma.user.findMany.mockResolvedValue(ADMINS);
    prisma.partnerAccount.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'pa-1',
      ...args.data,
    }));
    prisma.partnerAccount.update.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'pa-1',
      ...args.data,
    }));
  });

  /* ────────────────────────────────────────────────────────────────────────
   * candidatar — POST /partner/apply
   * ──────────────────────────────────────────────────────────────────────── */

  describe('candidatar', () => {
    it('recusa quem não é PROFESSIONAL', async () => {
      const body = await bodyOfRejection(
        service.candidatar(sessao({ roles: ['CLIENT'] }), { motivation: 'x'.repeat(30) }),
      );
      expect(body.error).toBeDefined();
      expect(prisma.partnerAccount.create).not.toHaveBeenCalled();
    });

    it('rejeita motivação curta quando autoApprove está desligado', async () => {
      const body = await bodyOfRejection(service.candidatar(sessao(), { motivation: 'curta' }));
      expect(body.error).toMatch(/motivação/i);
    });

    it('rejeita motivação com mais de 2000 caracteres mesmo com autoApprove ligado', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ autoApprovePartners: true });
      const body = await bodyOfRejection(
        service.candidatar(sessao(), { motivation: 'x'.repeat(2001) }),
      );
      expect(body.error).toMatch(/2000/);
    });

    it('cria candidatura pendente e notifica admins quando autoApprove está desligado', async () => {
      const motivation = 'x'.repeat(30);
      await service.candidatar(sessao(), { motivation });

      expect(prisma.partnerAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: EU,
            status: 'pending',
            partnerTier: 'starter',
            tierId: 'tier-starter',
            motivation,
          }),
        }),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(notifications.criar).toHaveBeenCalledTimes(ADMINS.length);
      expect(notifications.criar).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1', type: 'PARTNER_APPLICATION' }),
      );
    });

    it('cria já aprovada e adiciona a role PARTNER_B2B quando autoApprove está ligado', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ autoApprovePartners: true });

      await service.candidatar(sessao({ roles: ['PROFESSIONAL'] }), {});

      expect(prisma.partnerAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'approved' }) }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: EU },
        data: { roles: ['PROFESSIONAL', 'PARTNER_B2B'] },
      });
      expect(notifications.criar).not.toHaveBeenCalled();
    });

    it('não duplica a role PARTNER_B2B se o usuário já tiver', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ autoApprovePartners: true });

      await service.candidatar(sessao({ roles: ['PROFESSIONAL', 'PARTNER_B2B'] }), {});

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: EU },
        data: { roles: ['PROFESSIONAL', 'PARTNER_B2B'] },
      });
    });

    it('usa partnerTier "starter" sem tierId quando não há tier padrão ativo', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ autoApprovePartners: true });
      prisma.partnerTier.findFirst.mockResolvedValue(null);

      await service.candidatar(sessao(), {});

      const dataEnviada = prisma.partnerAccount.create.mock.calls[0][0].data;
      expect(dataEnviada.partnerTier).toBe('starter');
      expect(dataEnviada.tierId).toBeUndefined();
    });

    it('rejeita nova candidatura se já existe uma em andamento (pending ou approved)', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', status: 'pending' });
      const body = await bodyOfRejection(service.candidatar(sessao(), { motivation: 'x'.repeat(30) }));
      expect(body.error).toMatch(/já possui uma candidatura/i);
      expect(prisma.partnerAccount.update).not.toHaveBeenCalled();
    });

    it('reaplica candidatura rejeitada: volta a pending, limpa rejectionReason e remove a role PARTNER_B2B', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', status: 'rejected' });

      const motivation = 'nova tentativa, agora com mais detalhes';
      await service.candidatar(sessao({ roles: ['PROFESSIONAL', 'PARTNER_B2B'] }), { motivation });

      expect(prisma.partnerAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: EU },
          data: expect.objectContaining({
            motivation,
            status: 'pending',
            rejectionReason: null,
          }),
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: EU },
        data: { roles: ['PROFESSIONAL'] },
      });
      expect(notifications.criar).toHaveBeenCalledTimes(ADMINS.length);
      expect(notifications.criar).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1', type: 'PARTNER_REAPPLICATION' }),
      );
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * configurarConta — POST /partner/connect/setup
   * ──────────────────────────────────────────────────────────────────────── */

  describe('configurarConta', () => {
    it('404 quando não há candidatura e o usuário não é parceiro nem admin', async () => {
      const body = await bodyOfRejection(service.configurarConta(sessao({ roles: ['CLIENT'] })));
      expect(body.error).toBeDefined();
      expect(prisma.partnerAccount.create).not.toHaveBeenCalled();
    });

    it('auto-cria a candidatura aprovada quando o usuário já é PARTNER_B2B', async () => {
      prisma.partnerAccount.create.mockResolvedValue({
        id: 'pa-1',
        status: 'approved',
        stripeAccountId: null,
      });

      await service.configurarConta(sessao({ roles: ['PARTNER_B2B'] }));

      expect(prisma.partnerAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'approved' }) }),
      );
      expect(stripe.buscarOuCriarContaConectada).toHaveBeenCalled();
    });

    it('reaproveita a conta em corrida de criação (P2002)', async () => {
      const erroP2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      prisma.partnerAccount.create.mockRejectedValue(erroP2002);
      prisma.partnerAccount.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'pa-1', status: 'approved', stripeAccountId: null });

      await service.configurarConta(sessao({ roles: ['PARTNER_B2B'] }));

      expect(stripe.buscarOuCriarContaConectada).toHaveBeenCalled();
    });

    it('403 quando a candidatura não está aprovada e o usuário não é admin', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        id: 'pa-1',
        status: 'pending',
        stripeAccountId: null,
      });
      const body = await bodyOfRejection(service.configurarConta(sessao()));
      expect(body.error).toBeDefined();
    });

    it('admin ignora o status de aprovação', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        id: 'pa-1',
        status: 'pending',
        stripeAccountId: null,
      });

      await service.configurarConta(sessao({ isAdmin: true, systemRoles: ['ADMIN'] }));

      expect(stripe.buscarOuCriarContaConectada).toHaveBeenCalled();
    });

    it('retorna direto o stripeAccountId já salvo, sem chamar a Stripe', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        id: 'pa-1',
        status: 'approved',
        stripeAccountId: 'acct_existente',
      });

      const resultado = await service.configurarConta(sessao());

      expect(resultado).toEqual({ stripeAccountId: 'acct_existente' });
      expect(stripe.buscarOuCriarContaConectada).not.toHaveBeenCalled();
    });

    it('cria/reaproveita a conta na Stripe e persiste stripeAccountId + status pending', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        id: 'pa-1',
        status: 'approved',
        stripeAccountId: null,
      });

      const resultado = await service.configurarConta(sessao());

      expect(stripe.buscarOuCriarContaConectada).toHaveBeenCalledWith(
        expect.objectContaining({ userId: EU, partnerAccountId: 'pa-1' }),
      );
      expect(prisma.partnerAccount.update).toHaveBeenCalledWith({
        where: { id: 'pa-1' },
        data: { stripeAccountId: 'acct_new', stripeAccountStatus: 'pending' },
      });
      expect(resultado).toEqual({ stripeAccountId: 'acct_new' });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * criarSessaoDeOnboarding — POST /partner/connect/session
   * ──────────────────────────────────────────────────────────────────────── */

  describe('criarSessaoDeOnboarding', () => {
    beforeEach(() => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_1',
        status: 'approved',
      });
    });

    it('400 quando não há conta Stripe Connect configurada', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ stripeAccountId: null, status: 'approved' });
      const body = await bodyOfRejection(service.criarSessaoDeOnboarding(sessao(), {}));
      expect(body.error).toBeDefined();
    });

    it('403 quando a candidatura não está aprovada', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1', status: 'pending' });
      const body = await bodyOfRejection(service.criarSessaoDeOnboarding(sessao(), {}));
      expect(body.error).toBeDefined();
    });

    it('400 quando nenhum component informado é válido', async () => {
      const body = await bodyOfRejection(
        service.criarSessaoDeOnboarding(sessao(), { components: ['invalido'] }),
      );
      expect(body.error).toMatch(/component/i);
      expect(stripe.criarSessaoDeConta).not.toHaveBeenCalled();
    });

    it('usa account_onboarding como default quando components não é informado', async () => {
      await service.criarSessaoDeOnboarding(sessao(), {});
      expect(stripe.criarSessaoDeConta).toHaveBeenCalledWith('acct_1', {
        account_onboarding: { enabled: true },
      });
    });

    it('combina múltiplos components válidos', async () => {
      await service.criarSessaoDeOnboarding(sessao(), { components: ['payments', 'payouts'] });
      expect(stripe.criarSessaoDeConta).toHaveBeenCalledWith('acct_1', {
        payments: { enabled: true },
        payouts: { enabled: true },
      });
    });

    it('retorna o clientSecret da Account Session', async () => {
      const resultado = await service.criarSessaoDeOnboarding(sessao(), {});
      expect(resultado).toEqual({ clientSecret: 'cs_secret_1' });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * sincronizar — POST /partner/connect/sync
   * ──────────────────────────────────────────────────────────────────────── */

  describe('sincronizar', () => {
    beforeEach(() => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', stripeAccountId: 'acct_1' });
    });

    it('400 quando não há conta Stripe Connect configurada', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', stripeAccountId: null });
      const body = await bodyOfRejection(service.sincronizar(sessao()));
      expect(body.error).toBeDefined();
    });

    it('status active quando payouts e charges estão habilitados', async () => {
      stripe.buscarContaConectada.mockResolvedValue({
        payoutsEnabled: true,
        chargesEnabled: true,
        disabledReason: null,
      });

      const resultado = await service.sincronizar(sessao());

      expect(resultado).toEqual({ payoutsEnabled: true, chargesEnabled: true, stripeAccountStatus: 'active' });
      expect(prisma.partnerAccount.update).toHaveBeenCalledWith({
        where: { id: 'pa-1' },
        data: { payoutsEnabled: true, chargesEnabled: true, stripeAccountStatus: 'active' },
      });
    });

    it('status restricted quando não habilitado e há um motivo de bloqueio', async () => {
      stripe.buscarContaConectada.mockResolvedValue({
        payoutsEnabled: false,
        chargesEnabled: false,
        disabledReason: 'requirements.past_due',
      });

      const resultado = await service.sincronizar(sessao());
      expect(resultado.stripeAccountStatus).toBe('restricted');
    });

    it('status pending quando não habilitado e sem motivo de bloqueio', async () => {
      stripe.buscarContaConectada.mockResolvedValue({
        payoutsEnabled: false,
        chargesEnabled: false,
        disabledReason: null,
      });

      const resultado = await service.sincronizar(sessao());
      expect(resultado.stripeAccountStatus).toBe('pending');
    });
  });
});
