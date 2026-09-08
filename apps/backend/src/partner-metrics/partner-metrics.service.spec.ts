import { HttpException } from '@nestjs/common';

import { PartnerMetricsService } from './partner-metrics.service';

function prismaMock() {
  return {
    partnerAccount: { findUnique: jest.fn() },
    partnerSubscription: { findMany: jest.fn() },
  };
}

function sessao(over: Record<string, unknown> = {}) {
  return { id: 'u-1', roles: ['PROFESSIONAL'], isAdmin: false, ...over } as never;
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

/**
 * Fatia 34 (lote 2b) — RED. Métricas do parceiro.
 */
describe('PartnerMetricsService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: PartnerMetricsService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new PartnerMetricsService(prisma as any);
    prisma.partnerSubscription.findMany.mockResolvedValue([]);
  });

  it('conta pendente, sem ser admin → 403', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'pending' });
    const body = await bodyOfRejection(service.get(sessao()));
    expect(body).toEqual({ error: 'Conta de parceiro inválida ou não aprovada.' });
  });

  it('[controle] admin sem conta → zeros', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue(null);
    const r = await service.get(sessao({ isAdmin: true }));
    expect(r).toMatchObject({ grossMrr: 0, activeStudentsCount: 0, commissionRate: 0.5 });
  });

  it('customCommissionRate vence o tier', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue({
      status: 'approved',
      customCommissionRate: 0.2,
      commissionRate: 0.5,
      tier: { commissionRate: 0.3, name: 'Pro' },
    });
    prisma.partnerSubscription.findMany.mockResolvedValue([
      { offer: { price: 100, hourlyRate: 0 } },
    ]);
    const r = await service.get(sessao());
    expect(r.commissionRate).toBe(0.2);
    expect(r.netMrr).toBe(80);
  });

  it('hourlyRate soma no bruto', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue({
      status: 'approved',
      customCommissionRate: null,
      commissionRate: 0.5,
      tier: null,
    });
    prisma.partnerSubscription.findMany.mockResolvedValue([
      { offer: { price: 100, hourlyRate: 50 } },
    ]);
    const r = await service.get(sessao());
    expect(r.grossMrr).toBe(150);
  });
});
