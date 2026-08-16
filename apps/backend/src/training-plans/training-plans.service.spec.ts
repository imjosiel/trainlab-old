import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { TrainingPlansService } from './training-plans.service';

function prismaMock() {
  return {
    trainingPlan: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), update: jest.fn(), delete: jest.fn() },
    partnerAccount: { findFirst: jest.fn(), findMany: jest.fn() },
    partnerSubscription: { findFirst: jest.fn(), findMany: jest.fn() },
    student: { updateMany: jest.fn(), findMany: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function emailMock() {
  return { enviarPlanoAprovado: jest.fn().mockResolvedValue(undefined) };
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

function planRow(over: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    trainerId: TRAINER,
    athleteId: null,
    studentId: null,
    student: null,
    athlete: null,
    trainer: { id: TRAINER, name: 'Treinador', email: 'treinador@example.com' },
    title: 'Plano X',
    status: 'PENDING',
    ...over,
  };
}

describe('TrainingPlansService', () => {
  let prisma: PrismaMock;
  let email: ReturnType<typeof emailMock>;
  let notifications: ReturnType<typeof notificationsMock>;
  let service: TrainingPlansService;

  beforeEach(() => {
    prisma = prismaMock();
    email = emailMock();
    notifications = notificationsMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new TrainingPlansService(prisma as any, email as any, notifications as any);

    prisma.trainingPlan.findMany.mockResolvedValue([]);
    prisma.trainingPlan.count.mockResolvedValue(0);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * listar
   * ──────────────────────────────────────────────────────────────────────── */

  describe('listar', () => {
    it('trainer sempre filtra pelos próprios planos', async () => {
      await service.listar(sessao(), {});
      expect(prisma.trainingPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ trainerId: TRAINER }) }),
      );
    });

    it('admin puro (sem role de trainer), sem filtro explícito → vê todos os planos', async () => {
      await service.listar(sessao({ roles: ['CLIENT'], isAdmin: true }), {});
      const chamada = prisma.trainingPlan.findMany.mock.calls[0][0];
      expect(chamada.where).toEqual({});
    });

    it('admin com studentId explícito → filtra por studentId', async () => {
      await service.listar(sessao({ roles: ['CLIENT'], isAdmin: true }), { studentId: 'aluno-1' });
      expect(prisma.trainingPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { studentId: 'aluno-1' } }),
      );
    });

    it('atleta/aluno (não-trainer, não-admin) vê só os próprios, status restrito', async () => {
      await service.listar(sessao({ id: ATHLETE, roles: ['CLIENT'] }), {});
      expect(prisma.trainingPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ athleteId: ATHLETE }, { student: { userId: ATHLETE } }],
            status: { in: ['APPROVED', 'DELIVERED', 'COMPLETED'] },
          },
        }),
      );
    });

    it('status inválido é ignorado, sem quebrar a query', async () => {
      await service.listar(sessao(), { status: 'ESTADO_QUE_NAO_EXISTE' });
      const chamada = prisma.trainingPlan.findMany.mock.calls[0][0];
      expect(chamada.where).not.toHaveProperty('status');
    });

    it('atleta pedindo status PENDING (fora do permitido) → ignorado, não vaza planos pendentes', async () => {
      await service.listar(sessao({ id: ATHLETE, roles: ['CLIENT'] }), { status: 'PENDING' });
      const chamada = prisma.trainingPlan.findMany.mock.calls[0][0];
      expect(chamada.where.status).toEqual({ in: ['APPROVED', 'DELIVERED', 'COMPLETED'] });
    });

    it('[controle] trainer pedindo status PENDING é aceito', async () => {
      await service.listar(sessao(), { status: 'PENDING' });
      const chamada = prisma.trainingPlan.findMany.mock.calls[0][0];
      expect(chamada.where.status).toBe('PENDING');
    });

    it('busca por título via ?q= entra com ILIKE', async () => {
      await service.listar(sessao(), { q: 'força' });
      expect(prisma.trainingPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ title: { contains: 'força', mode: 'insensitive' } }) }),
      );
    });

    it('devolve total e pages calculados', async () => {
      prisma.trainingPlan.count.mockResolvedValue(120);
      const r = (await service.listar(sessao(), {})) as { total: number; pages: number };
      expect(r.total).toBe(120);
      expect(r.pages).toBe(3);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * buscar
   * ──────────────────────────────────────────────────────────────────────── */

  describe('buscar', () => {
    it('plano inexistente → 404', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.buscar('inexistente', sessao()));
      expect(body).toEqual({ error: 'Plano não encontrado' });
    });

    it('quem não é dono nem trainer nem admin → 403', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(planRow({ trainerId: 'outro-trainer' }));
      const body = await bodyOfRejection(service.buscar('plan-1', sessao({ id: 'estranho', roles: ['CLIENT'] })));
      expect(body).toEqual({ error: 'Forbidden' });
    });

    it('trainer dono vê o próprio plano', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(planRow());
      const r = (await service.buscar('plan-1', sessao())) as { plan: { id: string } };
      expect(r.plan.id).toBe('plan-1');
    });

    it('[controle] admin vê plano de qualquer trainer', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(planRow({ trainerId: 'outro-trainer' }));
      const r = await service.buscar('plan-1', sessao({ id: 'admin-1', roles: ['CLIENT'], isAdmin: true }));
      expect(r).toBeDefined();
    });

    it('B2B: aluno de treinador parceiro SEM assinatura ativa → 403 com code SUBSCRIPTION_REQUIRED', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(
        planRow({ athleteId: null, studentId: 'stu-1', student: { id: 'stu-1', userId: ATHLETE, user: {} } }),
      );
      prisma.partnerAccount.findFirst.mockResolvedValue({ id: 'pa-1' });
      prisma.partnerSubscription.findFirst.mockResolvedValue(null);

      const body = await bodyOfRejection(service.buscar('plan-1', sessao({ id: ATHLETE, roles: ['CLIENT'] })));
      expect(body).toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    });

    it('B2B: [controle] com assinatura ativa, acessa normalmente', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(
        planRow({ athleteId: null, studentId: 'stu-1', student: { id: 'stu-1', userId: ATHLETE, user: {} } }),
      );
      prisma.partnerAccount.findFirst.mockResolvedValue({ id: 'pa-1' });
      prisma.partnerSubscription.findFirst.mockResolvedValue({ id: 'sub-1' });

      await expect(service.buscar('plan-1', sessao({ id: ATHLETE, roles: ['CLIENT'] }))).resolves.toBeDefined();
    });

    it('B2B: [controle] trainer sem PartnerAccount não aciona o gate', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(
        planRow({ athleteId: null, studentId: 'stu-1', student: { id: 'stu-1', userId: ATHLETE, user: {} } }),
      );
      prisma.partnerAccount.findFirst.mockResolvedValue(null);

      await expect(service.buscar('plan-1', sessao({ id: ATHLETE, roles: ['CLIENT'] }))).resolves.toBeDefined();
      expect(prisma.partnerSubscription.findFirst).not.toHaveBeenCalled();
    });

    it('B2B: gate não se aplica ao próprio trainer visualizando', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(
        planRow({ studentId: 'stu-1', student: { id: 'stu-1', userId: 'outro-aluno', user: {} } }),
      );
      await expect(service.buscar('plan-1', sessao())).resolves.toBeDefined();
      expect(prisma.partnerAccount.findFirst).not.toHaveBeenCalled();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * atualizar
   * ──────────────────────────────────────────────────────────────────────── */

  describe('atualizar', () => {
    beforeEach(() => {
      prisma.trainingPlan.findUnique.mockResolvedValue(
        planRow({ athlete: { id: ATHLETE, name: 'Atleta', email: 'atleta@example.com' } }),
      );
      prisma.trainingPlan.update.mockResolvedValue(
        planRow({ athlete: { id: ATHLETE, name: 'Atleta', email: 'atleta@example.com' } }),
      );
    });

    it('plano inexistente → 404', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.atualizar('plan-1', sessao(), { status: 'APPROVED' }));
      expect(body).toEqual({ error: 'Plano não encontrado' });
    });

    it('quem não é o trainer nem admin → 403', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(planRow({ trainerId: 'outro' }));
      const body = await bodyOfRejection(service.atualizar('plan-1', sessao(), { status: 'APPROVED' }));
      expect(body).toEqual({ error: 'Apenas o treinador ou administradores podem aprovar/rejeitar planos' });
    });

    it('status inválido → 400', async () => {
      const body = await bodyOfRejection(service.atualizar('plan-1', sessao(), { status: 'VOANDO' }));
      expect(body).toEqual({ error: 'Status inválido.' });
    });

    it('finalPlan acima de 50.000 caracteres → 400', async () => {
      const body = await bodyOfRejection(service.atualizar('plan-1', sessao(), { finalPlan: 'x'.repeat(50_001) }));
      expect(body).toEqual({ error: 'finalPlan excede o limite de 50.000 caracteres.' });
    });

    it('trainerNotes acima de 5.000 caracteres → 400', async () => {
      const body = await bodyOfRejection(service.atualizar('plan-1', sessao(), { trainerNotes: 'x'.repeat(5001) }));
      expect(body).toEqual({ error: 'trainerNotes excede o limite de 5.000 caracteres.' });
    });

    it('status APPROVED seta approvedAt', async () => {
      await service.atualizar('plan-1', sessao(), { status: 'APPROVED' });
      expect(prisma.trainingPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', approvedAt: expect.any(Date) }) }),
      );
    });

    it('ao aprovar com destinatário com e-mail, envia e-mail de aprovação', async () => {
      await service.atualizar('plan-1', sessao(), { status: 'APPROVED' });
      expect(email.enviarPlanoAprovado).toHaveBeenCalledWith(
        expect.objectContaining({ athleteEmail: 'atleta@example.com' }),
      );
    });

    it('ao aprovar, notifica o destinatário', async () => {
      await service.atualizar('plan-1', sessao(), { status: 'APPROVED' });
      expect(notifications.criar).toHaveBeenCalledWith(
        expect.objectContaining({ userId: ATHLETE, type: 'PLAN_APPROVED' }),
      );
    });

    it('ao rejeitar, notifica com tipo PLAN_REJECTED, sem e-mail', async () => {
      await service.atualizar('plan-1', sessao(), { status: 'REJECTED' });
      expect(notifications.criar).toHaveBeenCalledWith(
        expect.objectContaining({ userId: ATHLETE, type: 'PLAN_REJECTED' }),
      );
      expect(email.enviarPlanoAprovado).not.toHaveBeenCalled();
    });

    it('ao entregar, notifica com tipo PLAN_DELIVERED', async () => {
      await service.atualizar('plan-1', sessao(), { status: 'DELIVERED' });
      expect(notifications.criar).toHaveBeenCalledWith(
        expect.objectContaining({ userId: ATHLETE, type: 'PLAN_DELIVERED' }),
      );
    });

    it('sem mudança de status, não notifica nem envia e-mail', async () => {
      await service.atualizar('plan-1', sessao(), { trainerNotes: 'nota interna' });
      expect(notifications.criar).not.toHaveBeenCalled();
      expect(email.enviarPlanoAprovado).not.toHaveBeenCalled();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * remover
   * ──────────────────────────────────────────────────────────────────────── */

  describe('remover', () => {
    it('plano inexistente → 404', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.remover('plan-1', sessao()));
      expect(body).toEqual({ error: 'Plano não encontrado' });
    });

    it('quem não é trainer nem admin → 403', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(planRow({ trainerId: 'outro' }));
      const body = await bodyOfRejection(service.remover('plan-1', sessao()));
      expect(body).toEqual({ error: 'Apenas o treinador ou administradores podem deletar planos' });
    });

    it('trainer dono remove o plano', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(planRow());
      await service.remover('plan-1', sessao());
      expect(prisma.trainingPlan.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * listarAtivos
   * ──────────────────────────────────────────────────────────────────────── */

  describe('listarAtivos', () => {
    beforeEach(() => {
      prisma.partnerSubscription.findMany.mockResolvedValue([]);
      prisma.student.updateMany.mockResolvedValue({ count: 0 });
      prisma.trainingPlan.findMany.mockResolvedValue([]);
      prisma.partnerAccount.findMany.mockResolvedValue([]);
      prisma.systemSettings.findFirst.mockResolvedValue(null);
      prisma.student.findMany.mockResolvedValue([]);
    });

    it('lista vazia → devolve { plans: [] }, sem tentar reconciliar nada', async () => {
      const r = await service.listarAtivos(sessao({ id: ATHLETE, roles: ['CLIENT'] }));
      expect(r).toEqual({ plans: [] });
    });

    it('calcula progresso das sessões', async () => {
      prisma.trainingPlan.findMany.mockResolvedValue([
        { id: 'p1', trainerId: null, trainingSessions: [{ completed: true }, { completed: false }] },
      ]);
      const r = (await service.listarAtivos(sessao({ id: ATHLETE, roles: ['CLIENT'] }))) as {
        plans: Array<{ progress: { total: number; completed: number; percent: number } }>;
      };
      expect(r.plans[0].progress).toEqual({ total: 2, completed: 1, percent: 50 });
    });

    it('plano de treinador parceiro SEM assinatura ativa é filtrado fora', async () => {
      prisma.trainingPlan.findMany.mockResolvedValue([
        { id: 'p1', trainerId: 'parceiro-1', trainingSessions: [] },
      ]);
      prisma.partnerAccount.findMany.mockResolvedValue([{ userId: 'parceiro-1' }]);
      prisma.partnerSubscription.findMany.mockResolvedValue([]); // nenhuma assinatura ativa

      const r = (await service.listarAtivos(sessao({ id: ATHLETE, roles: ['CLIENT'] }))) as { plans: unknown[] };
      expect(r.plans).toHaveLength(0);
    });

    it('[controle] plano de treinador parceiro COM assinatura ativa aparece', async () => {
      prisma.trainingPlan.findMany.mockResolvedValue([
        { id: 'p1', trainerId: 'parceiro-1', trainingSessions: [] },
      ]);
      prisma.partnerAccount.findMany.mockResolvedValue([{ userId: 'parceiro-1' }]);
      prisma.partnerSubscription.findMany.mockResolvedValue([
        { offer: { partner: { userId: 'parceiro-1' } } },
      ]);

      const r = (await service.listarAtivos(sessao({ id: ATHLETE, roles: ['CLIENT'] }))) as { plans: unknown[] };
      expect(r.plans).toHaveLength(1);
    });

    it('[controle] plano de treinador NÃO-parceiro nunca é filtrado', async () => {
      prisma.trainingPlan.findMany.mockResolvedValue([
        { id: 'p1', trainerId: 'saas-trainer', trainingSessions: [] },
      ]);
      prisma.partnerAccount.findMany.mockResolvedValue([]); // não é parceiro

      const r = (await service.listarAtivos(sessao({ id: ATHLETE, roles: ['CLIENT'] }))) as { plans: unknown[] };
      expect(r.plans).toHaveLength(1);
    });

    it('reconecta Student órfão (userId null, mesmo e-mail) do treinador com assinatura ativa', async () => {
      prisma.partnerSubscription.findMany.mockResolvedValue([
        { offer: { partner: { userId: 'parceiro-1', user: { id: 'parceiro-1' } } } },
      ]);
      await service.listarAtivos(sessao({ id: ATHLETE, roles: ['CLIENT'], email: 'atleta@example.com' }));
      expect(prisma.student.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: 'atleta@example.com', userId: null }),
          data: { userId: ATHLETE },
        }),
      );
    });

    it('devolve os defaults de vídeo quando não há SystemSettings', async () => {
      prisma.trainingPlan.findMany.mockResolvedValue([{ id: 'p1', trainerId: null, trainingSessions: [] }]);
      const r = (await service.listarAtivos(sessao({ id: ATHLETE, roles: ['CLIENT'] }))) as {
        settings: { enableVideoHoverPreview: boolean; videoHoverType: string };
      };
      expect(r.settings).toEqual({ enableVideoHoverPreview: true, videoHoverType: 'TEASER' });
    });
  });
});
