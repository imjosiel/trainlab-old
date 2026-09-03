import { HttpException } from '@nestjs/common';

import { AdminReportsExportService } from './admin-reports-export.service';

function prismaMock() {
  return { monthlyReport: { findUnique: jest.fn() } };
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
 * Fatia 35 (lote 2c) — RED. Export CSV de report.
 */
describe('AdminReportsExportService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminReportsExportService(prisma as any);
  });

  it('inexistente → 404', async () => {
    prisma.monthlyReport.findUnique.mockResolvedValue(null);
    const body = await bodyOfRejection(service.export('x'));
    expect(body).toEqual({ error: 'Relatório não encontrado.' });
  });

  it('[controle] exporta CSV com header e filename por período', async () => {
    prisma.monthlyReport.findUnique.mockResolvedValue({
      id: 'r1',
      period: '2026-01',
      grossRevenue: 100,
      activeSubscriptions: 2,
      stripeFeePercent: 3,
      stripeFeeFixed: 1,
      partnerCommissions: 10,
      totalExpenses: 14,
      netRevenue: 86,
      generatedAt: new Date('2026-02-01T00:00:00Z'),
      status: 'draft',
      expenses: [],
      distributions: [],
    });
    const r = await service.export('r1');
    expect(r.filename).toBe('relatorio-player-action-2026-01.csv');
    expect(r.csv).toContain('PLAYER ACTION');
    expect(r.csv).toContain('RESULTADO');
  });
});
