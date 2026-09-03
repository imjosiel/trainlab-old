import { AdminR2StorageService } from './admin-r2-storage.service';

function prismaMock() {
  return { exercise: { count: jest.fn(), findMany: jest.fn() } };
}

/**
 * Fatia 33 (lote 2a) — RED. R2 storage: resumo + por treinador.
 */
describe('AdminR2StorageService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: AdminR2StorageService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminR2StorageService(prisma as any);
    prisma.exercise.count.mockResolvedValue(0);
    prisma.exercise.findMany.mockResolvedValue([]);
  });

  it('[controle] vazio → zerado', async () => {
    const r = await service.get();
    expect(r.summary).toEqual({ total: 0, hlsDone: 0, hlsPending: 0 });
    expect(r.byTrainer).toEqual([]);
  });

  it('agrega done/pending e agrupa global sem trainer', async () => {
    prisma.exercise.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    prisma.exercise.findMany.mockResolvedValue([
      { id: '1', hlsProcessed: true, trainer: null },
      { id: '2', hlsProcessed: false, trainer: { id: 't1', name: 'T', image: null } },
      { id: '3', hlsProcessed: false, trainer: { id: 't1', name: 'T', image: null } },
    ]);
    const r = await service.get();
    expect(r.summary).toEqual({ total: 3, hlsDone: 1, hlsPending: 2 });
    expect(r.byTrainer).toHaveLength(2);
    expect(r.recent).toHaveLength(3);
  });

  it('ordena por total desc', async () => {
    prisma.exercise.findMany.mockResolvedValue([
      { id: '1', hlsProcessed: true, trainer: { id: 't1', name: 'T', image: null } },
      { id: '2', hlsProcessed: true, trainer: { id: 't2', name: 'U', image: null } },
      { id: '3', hlsProcessed: true, trainer: { id: 't2', name: 'U', image: null } },
    ]);
    const r = await service.get();
    expect(r.byTrainer[0].total).toBe(2);
  });
});
