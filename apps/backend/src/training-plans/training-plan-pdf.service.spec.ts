import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { TrainingPlanPdfService } from './training-plan-pdf.service';

function prismaMock() {
  return { trainingPlan: { findUnique: jest.fn() } };
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

const TRAINER = 'trainer-1';

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: TRAINER,
    name: 'Treinador',
    email: 'treinador@example.com',
    image: null,
    roles: ['PROFESSIONAL'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: null,
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

function planRow(over: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    title: 'Plano de Força',
    duration: 30,
    trainerId: TRAINER,
    athleteId: null,
    finalPlan: null,
    aiSuggestion: 'Resumo do plano.',
    trainer: { id: TRAINER, name: 'Treinador', email: 'treinador@example.com' },
    athlete: null,
    student: { id: 'stu-1', name: 'Aluno Teste', email: 'aluno@example.com', userId: null },
    trainingSessions: [],
    ...over,
  };
}

describe('TrainingPlanPdfService', () => {
  let prisma: PrismaMock;
  let service: TrainingPlanPdfService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new TrainingPlanPdfService(prisma as any);
    prisma.trainingPlan.findUnique.mockResolvedValue(planRow());
  });

  it('plano inexistente → 404', async () => {
    prisma.trainingPlan.findUnique.mockResolvedValue(null);
    const body = await bodyOfRejection(service.gerar('inexistente', sessao()));
    expect(body).toEqual({ error: 'Plano não encontrado' });
  });

  it('quem não é trainer/atleta/aluno dono → 403', async () => {
    prisma.trainingPlan.findUnique.mockResolvedValue(
      planRow({ trainerId: 'outro', student: { id: 'stu-1', userId: 'outro-aluno' } }),
    );
    const body = await bodyOfRejection(service.gerar('plan-1', sessao({ id: 'estranho', roles: ['CLIENT'] })));
    expect(body).toEqual({ error: 'Sem permissão' });
  });

  it('gera bytes de um PDF de verdade (assinatura %PDF)', async () => {
    const r = await service.gerar('plan-1', sessao());
    expect(r.bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('nome de arquivo sanitizado a partir do nome do aluno', async () => {
    const r = await service.gerar('plan-1', sessao());
    expect(r.filename).toBe('plano_treino_Aluno_Teste.pdf');
  });

  it('[controle] o próprio aluno dono também consegue gerar', async () => {
    const plan = planRow({ student: { id: 'stu-1', name: 'Aluno Teste', userId: 'aluno-dono' } });
    prisma.trainingPlan.findUnique.mockResolvedValue(plan);
    await expect(service.gerar('plan-1', sessao({ id: 'aluno-dono', roles: ['CLIENT'] }))).resolves.toBeDefined();
  });
});
