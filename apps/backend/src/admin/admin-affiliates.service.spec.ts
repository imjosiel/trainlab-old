import { AdminAffiliatesService } from './admin-affiliates.service';

function prismaMock() {
  return { affiliateAccount: { findMany: jest.fn(), count: jest.fn() } };
}

/**
 * Fatia 33 (lote 2a) — RED. Lista de afiliados.
 */
describe('AdminAffiliatesService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: AdminAffiliatesService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminAffiliatesService(prisma as any);
    prisma.affiliateAccount.findMany.mockResolvedValue([]);
    prisma.affiliateAccount.count.mockResolvedValue(0);
  });

  it('[controle] lista com paginação calculada', async () => {
    prisma.affiliateAccount.count.mockResolvedValue(120);
    const r = await service.listar(1);
    expect(r).toMatchObject({ total: 120, page: 1, pages: 3 });
    expect(prisma.affiliateAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, skip: 0 }),
    );
  });

  it('page ≤ 0 vira 1', async () => {
    const r = await service.listar(0);
    expect(r.page).toBe(1);
    expect(prisma.affiliateAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    );
  });

  it('page 2 pula 50', async () => {
    await service.listar(2);
    expect(prisma.affiliateAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, skip: 50 }),
    );
  });

  it('traz user + counts no include', async () => {
    await service.listar(1);
    const chamada = prisma.affiliateAccount.findMany.mock.calls[0][0];
    expect(chamada.include).toMatchObject({
      user: { select: expect.objectContaining({ email: true }) },
      _count: { select: expect.objectContaining({ earnings: true }) },
    });
  });
});
