import { ProfileStatsService } from './profile-stats.service';

function prismaMock() {
  return {
    trainingSession: { count: jest.fn(), findMany: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

/**
 * Fatia 32 (lote 1) — RED. Profile-stats: taxa exata + streak (A12/D28).
 */
describe('ProfileStatsService', () => {
  let prisma: PrismaMock;
  let service: ProfileStatsService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ProfileStatsService(prisma as any);
    prisma.trainingSession.count.mockResolvedValue(0);
    prisma.trainingSession.findMany.mockResolvedValue([]);
  });

  it('sem sessões → zerado', async () => {
    const r = await service.compute('u-1');
    expect(r).toEqual({ completionRate: 0, streak: 0 });
  });

  it('taxa usa duas contagens sem take (não amostra)', async () => {
    prisma.trainingSession.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4);
    const r = await service.compute('u-1');
    expect(r.completionRate).toBe(40);
    // Sem `take`: contagem sobre a janela inteira.
    expect(prisma.trainingSession.count.mock.calls[0][0]).not.toHaveProperty('take');
  });

  it('[controle] streak conta dias consecutivos até hoje', async () => {
    const hoje = new Date();
    const ontem = new Date(Date.now() - 86400000);
    prisma.trainingSession.count.mockResolvedValue(2);
    prisma.trainingSession.findMany.mockResolvedValue([
      { completedAt: hoje },
      { completedAt: ontem },
    ]);
    const r = await service.compute('u-1');
    expect(r.streak).toBe(2);
  });

  it('sessões não concluídas não entram no streak (NULLS FIRST — A12)', async () => {
    prisma.trainingSession.count.mockResolvedValue(0);
    prisma.trainingSession.findMany.mockImplementation((args: { where: unknown }) => {
      // Prova que o where filtra completed:true — sem null na coluna ordenada.
      expect(args.where).toMatchObject({ completed: true });
      return Promise.resolve([]);
    });
    await service.compute('u-1');
  });
});
