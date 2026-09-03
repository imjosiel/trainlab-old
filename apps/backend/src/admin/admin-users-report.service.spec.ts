import { HttpException } from '@nestjs/common';

import { AdminUsersReportService } from './admin-users-report.service';

function prismaMock() {
  return {
    user: { findUnique: jest.fn() },
    trainingPlan: { findMany: jest.fn() },
    partnerTier: { findUnique: jest.fn() },
    partnerSubscription: { findMany: jest.fn() },
    partnerOffer: { findMany: jest.fn() },
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

function usuario(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    name: 'U',
    email: 'u@e.c',
    athleteProfiles: [],
    partnerAccount: null,
    subscription: null,
    _count: { trainingPlansAsAthl: 0, studentsCreated: 0, exercises: 0, trainingPlansCreated: 0 },
    ...over,
  };
}

/**
 * Fatia 33 (lote 2a) — RED. Report de usuário.
 */
describe('AdminUsersReportService', () => {
  let prisma: PrismaMock;
  let service: AdminUsersReportService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminUsersReportService(prisma as any);
    prisma.trainingPlan.findMany.mockResolvedValue([]);
    prisma.partnerSubscription.findMany.mockResolvedValue([]);
    prisma.partnerOffer.findMany.mockResolvedValue([]);
  });

  it('inexistente → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const body = await bodyOfRejection(service.get('x'));
    expect(body).toEqual({ error: 'User not found' });
  });

  it('[controle] sem planos nem conta → taxas zeradas, partnerStats null', async () => {
    prisma.user.findUnique.mockResolvedValue(usuario());
    const r = await service.get('u1');
    expect(r.athleteStats).toMatchObject({ sessionCompletionRate: 0, exerciseCompletionRate: 0 });
    expect(r.coachStats).toMatchObject({ studentsManaged: 0 });
    expect(r.partnerStats).toBeNull();
  });

  it('sessões concluidas entram na taxa', async () => {
    prisma.user.findUnique.mockResolvedValue(usuario({ _count: { trainingPlansAsAthl: 1, studentsCreated: 0, exercises: 0, trainingPlansCreated: 0 } }));
    prisma.trainingPlan.findMany.mockResolvedValue([
      { trainingSessions: [{ completed: true, exercises: null }, { completed: false, exercises: null }] },
    ]);
    const r = await service.get('u1');
    expect(r.athleteStats.sessionCompletionRate).toBe(50);
  });

  it('com PartnerAccount sem tier, usa commissionRate da conta', async () => {
    prisma.user.findUnique.mockResolvedValue(
      usuario({ partnerAccount: { id: 'pa-1', tierId: null, customCommissionRate: null, commissionRate: 0.4 } }),
    );
    const r = await service.get('u1');
    expect(r.partnerStats).toMatchObject({ commissionRate: 0.4 });
  });
});
