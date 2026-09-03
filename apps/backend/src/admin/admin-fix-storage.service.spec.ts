import { AdminFixStorageService } from './admin-fix-storage.service';

function prismaMock() {
  return { exercise: { findMany: jest.fn(), updateMany: jest.fn() } };
}

/**
 * Fatia 33 (lote 2a) — RED. Fix-storage: só toca linha marcada errada.
 */
describe('AdminFixStorageService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: AdminFixStorageService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminFixStorageService(prisma as any);
  });

  it('[controle] nada errado → fixed 0 sem update', async () => {
    prisma.exercise.findMany.mockResolvedValue([]);
    const r = await service.fix();
    expect(r).toMatchObject({ fixed: 0 });
    expect(prisma.exercise.updateMany).not.toHaveBeenCalled();
  });

  it('corrige só os marcados errados para cloudinary', async () => {
    prisma.exercise.findMany.mockResolvedValue([
      { id: 'e1', name: 'E1', videoUrl: 'https://x/y.mp4' },
      { id: 'e2', name: 'E2', videoUrl: 'https://x/z.mp4' },
    ]);
    const r = await service.fix();
    expect(r.fixed).toBe(2);
    expect(prisma.exercise.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['e1', 'e2'] } },
        data: expect.objectContaining({ videoStorageProvider: 'cloudinary', hlsProcessed: false }),
      }),
    );
  });

  it('busca só provider r2 com URL fora do proxy', async () => {
    prisma.exercise.findMany.mockResolvedValue([]);
    await service.fix();
    expect(prisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ videoStorageProvider: 'r2' }),
      }),
    );
  });
});
