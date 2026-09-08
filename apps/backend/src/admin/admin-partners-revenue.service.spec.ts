import { AdminPartnersRevenueService } from './admin-partners-revenue.service';

function prismaMock() {
  return {
    partnerAccount: { count: jest.fn(), findMany: jest.fn() },
    partnerSubscription: { count: jest.fn() },
    userSubscription: { count: jest.fn() },
  };
}

/**
 * Fatia 35 (lote 2c) — RED. Receita de parceiros.
 */
describe('AdminPartnersRevenueService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminPartnersRevenueService(prisma as any);
    prisma.partnerAccount.count.mockResolvedValue(0);
    prisma.partnerSubscription.count.mockResolvedValue(0);
    prisma.userSubscription.count.mockResolvedValue(0);
    prisma.partnerAccount.findMany.mockResolvedValue([]);
  });

  it('[controle] zerado', async () => {
    const r = await service.get();
    expect(r.overview).toMatchObject({ totalPartners: 0, b2bPlatformMRR: 0 });
    expect(r.topPartners).toEqual([]);
  });

  it('soma ofertas × assinantes ativos por parceiro', async () => {
    prisma.partnerAccount.findMany.mockResolvedValue([
      {
        id: 'p1',
        commissionRate: 0.5,
        user: { name: 'P', email: 'p@e.c', image: null },
        offers: [
          { price: 100, subscriptions: [{ id: 's1' }, { id: 's2' }] },
          { price: 50, subscriptions: [] },
        ],
      },
    ]);
    const r = await service.get();
    expect(r.topPartners[0]).toMatchObject({
      totalRevenue: 200,
      platformRevenue: 100,
      activeStudents: 2,
    });
  });

  it('ordena por platformRevenue desc', async () => {
    prisma.partnerAccount.findMany.mockResolvedValue([
      { id: 'p1', commissionRate: 0.1, user: {}, offers: [{ price: 100, subscriptions: [{ id: 's1' }] }] },
      { id: 'p2', commissionRate: 0.5, user: {}, offers: [{ price: 100, subscriptions: [{ id: 's1' }] }] },
    ]);
    const r = await service.get();
    expect(r.topPartners[0].id).toBe('p2');
  });
});
