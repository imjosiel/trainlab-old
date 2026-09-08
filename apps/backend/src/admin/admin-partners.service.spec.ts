import { AdminPartnersService } from './admin-partners.service';
function prismaMock() {
  return { partnerAccount: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
}
describe('AdminPartnersService', () => {
  it('lista com paginação', async () => {
    const prisma: any = prismaMock();
    prisma.partnerAccount.count.mockResolvedValue(120);
    const svc = new AdminPartnersService(prisma);
    const r: any = await svc.listar(1);
    expect(r.total).toBe(120);
    expect(r.pages).toBe(3);
    expect(prisma.partnerAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 0 }));
  });
});
