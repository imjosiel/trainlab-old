import { AdminAuditLogsService } from './admin-audit-logs.service';

function prismaMock() {
  return { auditLog: { findMany: jest.fn(), count: jest.fn() } };
}

/**
 * Fatia 35 (lote 2c) — RED. Audit logs: filtros e paginação.
 */
describe('AdminAuditLogsService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminAuditLogsService(prisma as any);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
  });

  it('[controle] lista com paginação calculada', async () => {
    prisma.auditLog.count.mockResolvedValue(120);
    const r = await service.listar({});
    expect(r).toMatchObject({ total: 120, page: 1, pages: 3 });
  });

  it('filtros são cortados (60/100 chars)', async () => {
    await service.listar({ entity: 'x'.repeat(100), search: 'y'.repeat(200) });
    const chamada = prisma.auditLog.findMany.mock.calls[0][0];
    expect(chamada.where.entity).toHaveLength(60);
    expect(chamada.where.OR[0].actorName.contains).toHaveLength(100);
  });

  it('limit tem teto 100', async () => {
    await service.listar({ limit: '9999' });
    const chamada = prisma.auditLog.findMany.mock.calls[0][0];
    expect(chamada.take).toBe(100);
  });

  it('includeFilters=false pula agregações', async () => {
    prisma.auditLog.findMany.mockClear();
    await service.listar({ includeFilters: 'false' });
    // Só a listagem: 1 findMany (lista) + count, sem os 2 de filtros.
    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(1);
  });
});
