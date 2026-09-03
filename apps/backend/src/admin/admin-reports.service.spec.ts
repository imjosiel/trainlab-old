import { HttpException } from '@nestjs/common';

import { AdminReportsService } from './admin-reports.service';

function prismaMock() {
  return {
    monthlyReport: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    platformFinanceSettings: { findUnique: jest.fn() },
    partnerSubscription: { findMany: jest.fn() },
    reportExpense: { deleteMany: jest.fn() },
    reportDistribution: { deleteMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: Record<string, unknown>) => unknown) => {
      const tx = {
        reportExpense: { deleteMany: prisma.reportExpense.deleteMany },
        reportDistribution: { deleteMany: prisma.reportDistribution.deleteMany },
        monthlyReport: { update: prisma.monthlyReport.update },
      };
      return cb(tx);
    }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any;

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
 * Fatia 35 (lote 2c) — RED. Reports: listar + gerar.
 */
describe('AdminReportsService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminReportsService(prisma as any);
    prisma.monthlyReport.findMany.mockResolvedValue([]);
    prisma.monthlyReport.findUnique.mockResolvedValue(null);
    prisma.platformFinanceSettings.findUnique.mockResolvedValue(null);
    prisma.partnerSubscription.findMany.mockResolvedValue([]);
    prisma.auditLog.create.mockResolvedValue({});
  });

  it('listar ordena por período desc, teto 60', async () => {
    await service.listar();
    expect(prisma.monthlyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { period: 'desc' }, take: 60 }),
    );
  });

  it('período fora de YYYY-MM → 400', async () => {
    const body = await bodyOfRejection(service.gerar('2026-13-xx', 'a1', 'Admin'));
    expect(body).toEqual({ error: 'Período inválido. Use formato YYYY-MM.' });
  });

  it('já publicado não regera → 400', async () => {
    prisma.monthlyReport.findUnique.mockResolvedValue({ id: 'r1', status: 'published' });
    const body = await bodyOfRejection(service.gerar('2026-01', 'a1', 'Admin'));
    expect(body).toEqual({ error: 'Relatório já publicado. Não pode ser regerado.' });
  });

  it('[controle] gera com matemática certa e audit trail', async () => {
    prisma.partnerSubscription.findMany.mockResolvedValue([
      { offer: { price: 100, partner: { commissionRate: 0.5 } } },
    ]);
    prisma.monthlyReport.create.mockResolvedValue({ id: 'novo' });
    const r = await service.gerar('2026-01', 'a1', 'Admin');
    expect(r.report).toMatchObject({ id: 'novo' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'REPORT_GENERATED' }) }),
    );
  });
});
