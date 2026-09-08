import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { OnboardingService } from './onboarding.service';

function prismaMock() {
  return {
    athleteInvite: { findFirst: jest.fn() },
    student: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    partnerAccount: { findUnique: jest.fn(), create: jest.fn() },
    affiliateAccount: { findUnique: jest.fn(), create: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
    partnerTier: { findFirst: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

async function bodyOfRejection(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
    throw new Error('esperava rejeição, mas resolveu');
  } catch (err) {
    if (!(err instanceof HttpException)) throw err;
    return err.getResponse() as Record<string, unknown>;
  }
}

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: 'user-1',
    name: 'Usuário',
    email: 'user@example.com',
    image: null,
    roles: ['PENDING'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: null,
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

/**
 * Fatia 32 (lote 1) — RED. Onboarding: get (convite) + post (papéis/contas).
 */
describe('OnboardingService', () => {
  let prisma: PrismaMock;
  let service: OnboardingService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new OnboardingService(prisma as any);
    prisma.user.findUnique.mockResolvedValue({ roles: ['PENDING'], termsAcceptedAt: null, privacyAcceptedAt: null });
    prisma.user.update.mockResolvedValue({});
    prisma.systemSettings.findFirst.mockResolvedValue({});
    prisma.partnerTier.findFirst.mockResolvedValue(null);
    prisma.partnerAccount.findUnique.mockResolvedValue(null);
    prisma.partnerAccount.create.mockResolvedValue({ id: 'pa-1' });
    prisma.affiliateAccount.findUnique.mockResolvedValue(null);
    prisma.affiliateAccount.create.mockResolvedValue({ id: 'aa-1' });
  });

  describe('get', () => {
    it('sem email na sessão → sem convite', async () => {
      const r = await service.get(sessao({ email: null }));
      expect(r).toEqual({ pendingInvite: null });
      expect(prisma.athleteInvite.findFirst).not.toHaveBeenCalled();
    });

    it('sem convite → null', async () => {
      prisma.athleteInvite.findFirst.mockResolvedValue(null);
      const r = await service.get(sessao());
      expect(r).toEqual({ pendingInvite: null });
    });

    it('[controle] com convite, devolve dados do treinador', async () => {
      prisma.athleteInvite.findFirst.mockResolvedValue({
        id: 'inv-1',
        token: 'tok',
        trainer: { id: 't1', name: 'Treinador', image: null },
        studentId: null,
      });
      const r = await service.get(sessao());
      expect(r.pendingInvite).toMatchObject({ inviteId: 'inv-1', trainerName: 'Treinador' });
    });
  });

  describe('post', () => {
    it('role fora da lista → 400', async () => {
      const body = await bodyOfRejection(service.post(sessao(), { role: 'DONO' } as never));
      expect(body).toEqual({ error: 'Role inválido.' });
    });

    it('BOTH depreciado → 400 (texto do OnboardingBody: fora da lista)', async () => {
      const body = await bodyOfRejection(service.post(sessao(), { role: 'BOTH' } as never));
      expect(body).toEqual({ error: 'Role inválido.' });
    });

    it('[controle] INDIVIDUAL troca PENDING e grava consentimento', async () => {
      await service.post(sessao(), { role: 'INDIVIDUAL' });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ roles: ['INDIVIDUAL'] }),
        }),
      );
    });

    it('PARTNER_B2B preserva AFFILIATE existente e cria PartnerAccount', async () => {
      prisma.user.findUnique.mockResolvedValue({ roles: ['AFFILIATE'], termsAcceptedAt: new Date(), privacyAcceptedAt: new Date() });
      await service.post(sessao(), { role: 'PARTNER_B2B' });
      const chamada = prisma.user.update.mock.calls[0][0];
      expect(chamada.data.roles).toEqual(expect.arrayContaining(['PROFESSIONAL', 'PARTNER_B2B', 'AFFILIATE']));
      expect(prisma.partnerAccount.create).toHaveBeenCalled();
    });

    it('AFFILIATE cria AffiliateAccount aprovada', async () => {
      prisma.affiliateAccount.findUnique.mockResolvedValue(null);
      await service.post(sessao(), { role: 'AFFILIATE' });
      expect(prisma.affiliateAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'approved' }) }),
      );
    });

    it('PROFESSIONAL com telefone grava formatado', async () => {
      await service.post(sessao(), { role: 'PROFESSIONAL', phone: '11988887777' } as never);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ phone: '(11) 98888-7777' }) }),
      );
    });
  });
});
