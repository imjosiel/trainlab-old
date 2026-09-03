import { AdminOverviewService } from './admin-overview.service';

function prismaMock() {
  return {
    user: { count: jest.fn(), findMany: jest.fn() },
    trainingPlan: { count: jest.fn() },
    userSubscription: { count: jest.fn(), groupBy: jest.fn() },
    saaSTier: { findMany: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

/**
 * Fatia 33 (lote 2a) — RED. Overview: MRR cruza groupBy com preço do tier.
 */
describe('AdminOverviewService', () => {
  let prisma: PrismaMock;
  let service: AdminOverviewService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminOverviewService(prisma as any);
    prisma.user.count.mockResolvedValue(0);
    prisma.trainingPlan.count.mockResolvedValue(0);
    prisma.userSubscription.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.saaSTier.findMany.mockResolvedValue([]);
    prisma.userSubscription.groupBy.mockResolvedValue([]);
  });

  it('[controle] zerado sem dados', async () => {
    const r = await service.get();
    expect(r.stats).toMatchObject({
      totalUsers: 0,
      totalPlans: 0,
      activeSubscriptions: 0,
      estimatedMrr: 0,
    });
    expect(r.recentUsers).toEqual([]);
  });

  it('MRR soma preço × contagem por plano (case-insensitive)', async () => {
    prisma.saaSTier.findMany.mockResolvedValue([{ name: 'Base', price: 97 }]);
    prisma.userSubscription.groupBy.mockResolvedValue([
      { plan: 'BASE', _count: { id: 3 } },
    ]);
    const r = await service.get();
    expect(r.stats.estimatedMrr).toBe(291);
  });

  it('plano sem tier correspondente é ignorado, não quebra (D115)', async () => {
    prisma.saaSTier.findMany.mockResolvedValue([{ name: 'Base', price: 97 }]);
    prisma.userSubscription.groupBy.mockResolvedValue([
      { plan: 'Fantasma', _count: { id: 10 } },
    ]);
    const r = await service.get();
    expect(r.stats.estimatedMrr).toBe(0);
  });

  it('recentUsers traz 5 últimos com select recortado', async () => {
    await service.get();
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        select: expect.objectContaining({ email: true, roles: true }),
      }),
    );
  });
});
