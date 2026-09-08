import { DashboardService } from './dashboard.service';

function prismaMock() {
  return {
    trainingPlan: { findMany: jest.fn(), count: jest.fn() },
    student: { findMany: jest.fn() },
    trainingSession: { findMany: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function sessao(over: Record<string, unknown> = {}) {
  return { id: 'u-1', roles: ['PROFESSIONAL'], ...over } as never;
}

/**
 * Fatia 32 (lote 1) — RED. Dashboard: agregação por papel.
 */
describe('DashboardService', () => {
  let prisma: PrismaMock;
  let service: DashboardService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new DashboardService(prisma as any);
    prisma.trainingPlan.findMany.mockResolvedValue([]);
    prisma.trainingPlan.count.mockResolvedValue(0);
    prisma.student.findMany.mockResolvedValue([]);
    prisma.trainingSession.findMany.mockResolvedValue([]);
  });

  it('trainer filtra planos pelos próprios', async () => {
    await service.get(sessao());
    expect(prisma.trainingPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ trainerId: 'u-1' }) }),
    );
  });

  it('trainer conta alunos e planos do mês', async () => {
    prisma.student.findMany.mockResolvedValue([{ createdAt: new Date() }]);
    prisma.trainingPlan.count.mockResolvedValue(3);
    const r = await service.get(sessao());
    expect(r.totalAthletes).toBe(1);
    expect(r.plansThisMonth).toBe(3);
  });

  it('atleta recebe completionRate + streak, sem contagem de alunos', async () => {
    const hoje = new Date();
    prisma.trainingSession.findMany.mockResolvedValue([
      { completed: true, completedAt: hoje },
      { completed: false, completedAt: null },
    ]);
    const r = await service.get(sessao({ roles: ['INDIVIDUAL'] }));
    expect(r.athleteStats).toMatchObject({ completionRate: 50 });
    expect(r.totalAthletes).toBe(0);
  });

  it('[controle] sem nada, zerado com 30 dias de série', async () => {
    const r = await service.get(sessao());
    expect(r.totalPlans).toBe(0);
    expect(r.plansByDay).toHaveLength(30);
    expect(r.plansByStatus).toMatchObject({ PENDING: 0, COMPLETED: 0 });
  });

  it('status desconhecido no banco não quebra a contagem', async () => {
    prisma.trainingPlan.findMany.mockResolvedValue([
      { id: '1', status: 'PENDING', createdAt: new Date() },
      { id: '2', status: 'ESTADO_X', createdAt: new Date() },
    ]);
    const r = await service.get(sessao());
    expect(r.totalPlans).toBe(2);
    expect(r.plansByStatus).not.toHaveProperty('ESTADO_X');
  });
});
