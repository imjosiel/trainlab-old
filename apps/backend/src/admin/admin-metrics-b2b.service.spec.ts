import { AdminMetricsB2bService } from './admin-metrics-b2b.service';

function prismaMock() {
  return { partnerSubscription: { findMany: jest.fn() } };
}

function sub(over: Record<string, unknown> = {}) {
  return {
    offer: {
      price: 100,
      partner: {
        id: 'p1',
        user: { name: 'Parceiro', image: null },
        partnerTier: 'starter',
        commissionRate: 0.5,
      },
    },
    status: 'active',
    ...over,
  };
}

/**
 * Fatia 33 (lote 2a) — RED. Métricas B2B.
 */
describe('AdminMetricsB2bService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: AdminMetricsB2bService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminMetricsB2bService(prisma as any);
    prisma.partnerSubscription.findMany.mockResolvedValue([]);
  });

  it('[controle] zerado sem assinaturas', async () => {
    const r = await service.get();
    expect(r).toMatchObject({ totalGrossMrr: 0, totalActiveB2BStudents: 0, topPartners: [] });
  });

  it('soma bruto e corte da plataforma', async () => {
    prisma.partnerSubscription.findMany.mockResolvedValue([sub(), sub()]);
    const r = await service.get();
    expect(r.totalGrossMrr).toBe(200);
    expect(r.totalPlatformCutMrr).toBe(100);
    expect(r.totalActiveB2BStudents).toBe(2);
  });

  it('assinatura sem offer/partner é filtrada (conta deletada)', async () => {
    prisma.partnerSubscription.findMany.mockResolvedValue([sub(), sub({ offer: null })]);
    const r = await service.get();
    expect(r.totalGrossMrr).toBe(100);
    expect(r.totalActiveB2BStudents).toBe(1);
  });

  it('top 10 ordenado por receita, 2 casas', async () => {
    prisma.partnerSubscription.findMany.mockResolvedValue([
      sub({ offer: { price: 33.333, partner: { id: 'p2', user: {}, partnerTier: 's', commissionRate: 0.5 } } }),
      sub(),
    ]);
    const r = await service.get();
    expect(r.topPartners).toHaveLength(2);
    expect(r.topPartners[0].generatedRevenue).toBe(100);
    expect(r.topPartners[1].generatedRevenue).toBe(33.33);
  });
});
