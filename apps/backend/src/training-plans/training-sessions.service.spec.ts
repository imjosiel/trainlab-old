import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { TrainingSessionsService } from './training-sessions.service';

function prismaMock() {
  return {
    trainingSession: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), create: jest.fn(), count: jest.fn() },
    trainingPlan: { findUnique: jest.fn(), updateMany: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function emailMock() {
  return { enviarPlanoConcluido: jest.fn().mockResolvedValue(undefined) };
}

function notificationsMock() {
  return { criar: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
}

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
const ATHLETE = 'athlete-1';

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

function sessionRow(over: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    planId: 'plan-1',
    completed: false,
    exercises: '[]',
    athleteFeedback: null,
    athleteFeedbackRating: null,
    plan: {
      id: 'plan-1',
      title: 'Plano X',
      trainerId: TRAINER,
      athleteId: ATHLETE,
      student: null,
      athlete: { id: ATHLETE, name: 'Atleta', email: 'atleta@example.com' },
      trainer: { id: TRAINER, name: 'Treinador', email: 'treinador@example.com' },
      trainingSessions: [{ id: 'sess-1', completed: false }],
    },
    ...over,
  };
}

describe('TrainingSessionsService', () => {
  let prisma: PrismaMock;
  let email: ReturnType<typeof emailMock>;
  let notifications: ReturnType<typeof notificationsMock>;
  let service: TrainingSessionsService;

  beforeEach(() => {
    prisma = prismaMock();
    email = emailMock();
    notifications = notificationsMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new TrainingSessionsService(prisma as any, email as any, notifications as any);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * buscar
   * ──────────────────────────────────────────────────────────────────────── */

  describe('buscar', () => {
    it('sessão inexistente → 404', async () => {
      prisma.trainingSession.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.buscar('inexistente', sessao()));
      expect(body).toEqual({ error: 'Sessao nao encontrada' });
    });

    it('quem não é dono/trainer/admin → 403', async () => {
      prisma.trainingSession.findUnique.mockResolvedValue(
        sessionRow({ plan: { trainerId: 'outro', athleteId: null, student: null } }),
      );
      const body = await bodyOfRejection(service.buscar('sess-1', sessao({ id: 'estranho', roles: ['CLIENT'] })));
      expect(body).toEqual({ error: 'Sem permissão' });
    });

    it('trainer dono vê a sessão', async () => {
      prisma.trainingSession.findUnique.mockResolvedValue(sessionRow());
      await expect(service.buscar('sess-1', sessao())).resolves.toBeDefined();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * atualizar — marcar concluída, feedback
   * ──────────────────────────────────────────────────────────────────────── */

  describe('atualizar', () => {
    beforeEach(() => {
      prisma.trainingSession.findUnique.mockResolvedValue(sessionRow());
      prisma.trainingSession.update.mockResolvedValue(sessionRow({ completed: true }));
      prisma.trainingSession.count.mockResolvedValue(0);
    });

    it('atleta não pode reabrir sessão já concluída', async () => {
      prisma.trainingSession.findUnique.mockResolvedValue(
        sessionRow({ completed: true, plan: { ...sessionRow().plan, athleteId: ATHLETE, trainerId: null } }),
      );
      const body = await bodyOfRejection(
        service.atualizar('sess-1', sessao({ id: ATHLETE, roles: ['CLIENT'] }), { completed: false }),
      );
      expect(body).toEqual({ error: 'Sessão já concluída não pode ser reaberta.' });
    });

    it('[controle] trainer PODE reabrir sessão concluída', async () => {
      prisma.trainingSession.findUnique.mockResolvedValue(sessionRow({ completed: true }));
      await expect(service.atualizar('sess-1', sessao(), { completed: false })).resolves.toBeDefined();
    });

    it('marcar completed seta completedAt', async () => {
      await service.atualizar('sess-1', sessao(), { completed: true });
      expect(prisma.trainingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ completed: true, completedAt: expect.any(Date) }) }),
      );
    });

    it('quando a última sessão do plano é concluída, marca o plano COMPLETED e notifica o trainer', async () => {
      prisma.trainingSession.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1); // completed=1, total=1
      prisma.trainingPlan.updateMany.mockResolvedValue({ count: 1 });

      const r = (await service.atualizar('sess-1', sessao({ id: ATHLETE, roles: ['CLIENT'] }), { completed: true })) as {
        planCompleted: boolean;
      };

      expect(r.planCompleted).toBe(true);
      expect(prisma.trainingPlan.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'plan-1', status: { not: 'COMPLETED' } }, data: { status: 'COMPLETED' } }),
      );
      expect(email.enviarPlanoConcluido).toHaveBeenCalled();
      expect(notifications.criar).toHaveBeenCalledWith(
        expect.objectContaining({ userId: TRAINER, type: 'PLAN_COMPLETED' }),
      );
    });

    it('[controle] nem todas as sessões concluídas → não completa o plano', async () => {
      prisma.trainingSession.count.mockResolvedValueOnce(1).mockResolvedValueOnce(3);
      const r = (await service.atualizar('sess-1', sessao(), { completed: true })) as { planCompleted: boolean };
      expect(r.planCompleted).toBe(false);
      expect(prisma.trainingPlan.updateMany).not.toHaveBeenCalled();
    });

    it('feedback de atleta notifica o trainer', async () => {
      await service.atualizar('sess-1', sessao({ id: ATHLETE, roles: ['CLIENT'] }), {
        athleteFeedback: 'Muito bom!',
      });
      expect(notifications.criar).toHaveBeenCalledWith(
        expect.objectContaining({ userId: TRAINER, type: 'PLAN_FEEDBACK' }),
      );
    });

    it('[controle] sem feedback, não notifica nada relacionado a PLAN_FEEDBACK', async () => {
      await service.atualizar('sess-1', sessao({ id: ATHLETE, roles: ['CLIENT'] }), {});
      expect(notifications.criar).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PLAN_FEEDBACK' }),
      );
    });

    it('rating fora de 1-5 é ignorado, mantém o anterior', async () => {
      await service.atualizar('sess-1', sessao(), { athleteFeedbackRating: 99 });
      expect(prisma.trainingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ athleteFeedbackRating: null }) }),
      );
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * editar — treinador edita a sessão
   * ──────────────────────────────────────────────────────────────────────── */

  describe('editar', () => {
    beforeEach(() => {
      prisma.trainingSession.findUnique.mockResolvedValue({ id: 'sess-1', plan: { trainerId: TRAINER } });
      prisma.trainingSession.update.mockResolvedValue({ id: 'sess-1' });
    });

    it('quem não é trainer nem admin → 403', async () => {
      prisma.trainingSession.findUnique.mockResolvedValue({ id: 'sess-1', plan: { trainerId: 'outro' } });
      const body = await bodyOfRejection(service.editar('sess-1', sessao(), { title: 'Novo título' }));
      expect(body).toEqual({ error: 'Sem permissão' });
    });

    it('edita os campos enviados', async () => {
      await service.editar('sess-1', sessao(), { title: 'Novo título', day: 3 });
      expect(prisma.trainingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ title: 'Novo título', day: 3 }) }),
      );
    });

    it('day é clampado entre 1 e 365', async () => {
      await service.editar('sess-1', sessao(), { day: 9999 });
      expect(prisma.trainingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ day: 365 }) }),
      );
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * remover
   * ──────────────────────────────────────────────────────────────────────── */

  describe('remover', () => {
    it('quem não é trainer nem admin → 403', async () => {
      prisma.trainingSession.findUnique.mockResolvedValue({ id: 'sess-1', plan: { trainerId: 'outro' } });
      const body = await bodyOfRejection(service.remover('sess-1', sessao()));
      expect(body).toEqual({ error: 'Sem permissão' });
    });

    it('trainer dono remove', async () => {
      prisma.trainingSession.findUnique.mockResolvedValue({ id: 'sess-1', plan: { trainerId: TRAINER } });
      await service.remover('sess-1', sessao());
      expect(prisma.trainingSession.delete).toHaveBeenCalledWith({ where: { id: 'sess-1' } });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * criar — POST /training-plans/:id/sessions
   * ──────────────────────────────────────────────────────────────────────── */

  describe('criar', () => {
    beforeEach(() => {
      prisma.trainingPlan.findUnique.mockResolvedValue({ id: 'plan-1', trainerId: TRAINER });
      prisma.trainingSession.create.mockResolvedValue({ id: 'sess-novo' });
    });

    it('plano inexistente → 404', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.criar('plan-1', sessao(), { title: 'T', day: 1 }));
      expect(body).toEqual({ error: 'Plano não encontrado' });
    });

    it('quem não é trainer nem admin → 403', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue({ id: 'plan-1', trainerId: 'outro' });
      const body = await bodyOfRejection(service.criar('plan-1', sessao(), { title: 'T', day: 1 }));
      expect(body).toEqual({ error: 'Sem permissão' });
    });

    it('sem título ou dia → 400', async () => {
      const body = await bodyOfRejection(service.criar('plan-1', sessao(), { title: 'T' }));
      expect(body).toEqual({ error: 'Título e dia são obrigatórios' });
    });

    it('dia negativo → 400 (diferente de "campo ausente", embora 0 caia nesse balde por !day)', async () => {
      const body = await bodyOfRejection(service.criar('plan-1', sessao(), { title: 'T', day: -5 }));
      expect(body).toEqual({ error: 'O campo "dia" deve ser um número inteiro positivo (ex: 1, 2, 7).' });
    });

    it('cria a sessão com os dados válidos', async () => {
      await service.criar('plan-1', sessao(), { title: 'Treino de força', day: 3, duration: 60 });
      expect(prisma.trainingSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ planId: 'plan-1', title: 'Treino de força', day: 3 }) }),
      );
    });
  });
});
