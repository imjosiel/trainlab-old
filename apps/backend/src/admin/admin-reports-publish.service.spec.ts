import { HttpException } from '@nestjs/common';

import { AdminReportsPublishService } from './admin-reports-publish.service';

function prismaMock() {
  return {
    monthlyReport: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
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

/**
 * Fatia 35 (lote 2c) — RED. Publish de report.
 */
describe('AdminReportsPublishService', () => {
  let prisma: PrismaMock;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminReportsPublishService(prisma as any);
    prisma.auditLog.create.mockResolvedValue({});
  });

  it('inexistente → 404', async () => {
    prisma.monthlyReport.findUnique.mockResolvedValue(null);
    const body = await bodyOfRejection(service.publish('x', 'a1', 'Admin'));
    expect(body).toEqual({ error: 'Relatório não encontrado.' });
  });

  it('já publicado → 400', async () => {
    prisma.monthlyReport.findUnique.mockResolvedValue({ id: 'r1', status: 'published' });
    const body = await bodyOfRejection(service.publish('r1', 'a1', 'Admin'));
    expect(body).toEqual({ error: 'Relatório já publicado.' });
  });

  it('[controle] publica com timestamp + audit', async () => {
    prisma.monthlyReport.findUnique.mockResolvedValue({ id: 'r1', status: 'draft' });
    prisma.monthlyReport.update.mockResolvedValue({ id: 'r1', status: 'published' });
    const r = await service.publish('r1', 'a1', 'Admin');
    expect(r.report).toMatchObject({ status: 'published' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'REPORT_PUBLISHED' }) }),
    );
  });
});
