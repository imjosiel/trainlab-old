import { AdminUsersService } from './admin-users.service';

function prismaMock() {
  return { user: { findMany: jest.fn(), count: jest.fn() } };
}

/**
 * Fatia 35 (lote 2c) — RED. Lista de usuários: busca e filtros de papel.
 */
describe('AdminUsersService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminUsersService(prisma as any);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
  });

  it('[controle] lista paginada com default limit 20', async () => {
    const r = await service.listar({});
    expect(r.pagination).toMatchObject({ total: 0, currentPage: 1, limit: 20 });
  });

  it('busca entra com ILIKE em nome e email', async () => {
    await service.listar({ search: 'ana' });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { name: { contains: 'ana', mode: 'insensitive' } },
            { email: { contains: 'ana', mode: 'insensitive' } },
          ]),
        }),
      }),
    );
  });

  it('role ADMIN filtra systemRoles; role PROFESSIONAL filtra roles', async () => {
    await service.listar({ role: 'ADMIN' });
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      systemRoles: { has: 'ADMIN' },
    });
    await service.listar({ role: 'PROFESSIONAL' });
    expect(prisma.user.findMany.mock.calls[1][0].where).toMatchObject({
      roles: { has: 'PROFESSIONAL' },
    });
  });

  it('limit tem teto 100', async () => {
    await service.listar({ limit: '9999' });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});
