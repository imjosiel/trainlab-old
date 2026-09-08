import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { StudentsService } from './students.service';

function prismaMock() {
  return {
    student: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), create: jest.fn(), delete: jest.fn() },
    trainingPlan: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
    user: { findUnique: jest.fn() },
    sport: { findUnique: jest.fn(), findFirst: jest.fn() },
    partnerAccount: { findUnique: jest.fn() },
    partnerTier: { findFirst: jest.fn() },
    saaSTier: { findFirst: jest.fn() },
    athleteInvite: { upsert: jest.fn() },
    athleteProfile: { findMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function emailMock() {
  return { enviarConviteDeAtleta: jest.fn().mockResolvedValue(undefined) };
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

const EU = 'trainer-1';
const OUTRO = 'trainer-2';

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: EU,
    name: 'Treinador',
    email: 'treinador@example.com',
    image: null,
    roles: ['PROFESSIONAL'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: null,
    // Default: assinatura SaaS ativa no token (callback jwt a preenche — D4).
    // Testes de free sobrescrevem com null.
    subscriptionPlan: 'Base',
    stripeCustomerId: null,
    ...over,
  };
}

function studentRow(over: Record<string, unknown> = {}) {
  return {
    id: 'student-1',
    name: 'Aluno',
    email: null,
    trainerId: EU,
    userId: null,
    createdAt: new Date('2026-01-01'),
    athleteProfiles: [],
    _count: { trainingPlans: 0 },
    user: null,
    ...over,
  };
}

describe('StudentsService', () => {
  let prisma: PrismaMock;
  let email: ReturnType<typeof emailMock>;
  let notifications: ReturnType<typeof notificationsMock>;
  let service: StudentsService;

  beforeEach(() => {
    prisma = prismaMock();
    email = emailMock();
    notifications = notificationsMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new StudentsService(prisma as any, email as any, notifications as any);

    prisma.student.findMany.mockResolvedValue([]);
    prisma.student.count.mockResolvedValue(0);
    prisma.trainingPlan.groupBy.mockResolvedValue([]);
    prisma.partnerAccount.findUnique.mockResolvedValue({ tier: { maxAthletes: null } });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * listar
   * ──────────────────────────────────────────────────────────────────────── */

  describe('listar', () => {
    it('lista os próprios alunos por padrão', async () => {
      await service.listar(sessao(), {});
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ trainerId: EU }) }),
      );
    });

    it('trainerId de outro treinador sem ser admin → 403', async () => {
      const body = await bodyOfRejection(service.listar(sessao(), { trainerId: OUTRO }));
      expect(body).toEqual({ error: 'Acesso negado.' });
    });

    it('[controle] admin pode listar alunos de outro treinador', async () => {
      await service.listar(sessao({ isAdmin: true }), { trainerId: OUTRO });
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ trainerId: OUTRO }) }),
      );
    });

    it('busca por nome via ?q= entra no where com ILIKE', async () => {
      await service.listar(sessao(), { q: 'joão' });
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ name: { contains: 'joão', mode: 'insensitive' } }),
        }),
      );
    });

    it('aceita ?search= como alias legado de ?q=', async () => {
      await service.listar(sessao(), { search: 'maria' });
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ name: { contains: 'maria', mode: 'insensitive' } }),
        }),
      );
    });

    it('[controle] sem busca, where não tem filtro de nome', async () => {
      await service.listar(sessao(), {});
      const chamada = prisma.student.findMany.mock.calls[0][0];
      expect(chamada.where).not.toHaveProperty('name');
    });

    it('agrega planCounts por status a partir do groupBy', async () => {
      prisma.student.findMany.mockResolvedValue([studentRow({ id: 's1' })]);
      prisma.student.count.mockResolvedValue(1);
      prisma.trainingPlan.groupBy
        .mockResolvedValueOnce([{ studentId: 's1', _count: { studentId: 3 } }]) // active
        .mockResolvedValueOnce([{ studentId: 's1', _count: { studentId: 2 } }]) // completed
        .mockResolvedValueOnce([{ studentId: 's1', _count: { studentId: 1 } }]); // pending

      const r = await service.listar(sessao(), {});
      expect(r.students[0].planCounts).toEqual({ total: 0, active: 3, completed: 2, pending: 1 });
    });

    it('lista vazia não chama groupBy (evita query com IN vazio)', async () => {
      await service.listar(sessao(), {});
      expect(prisma.trainingPlan.groupBy).not.toHaveBeenCalled();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * criar
   * ──────────────────────────────────────────────────────────────────────── */

  describe('criar', () => {
    beforeEach(() => {
      prisma.sport.findFirst.mockResolvedValue({ id: 'sport-1' });
      prisma.student.create.mockResolvedValue({
        id: 'student-novo',
        name: 'Novo Aluno',
        email: null,
        athleteProfiles: [{ id: 'ap-1' }],
        user: null,
      });
    });

    it('quem não é treinador nem admin → 403', async () => {
      const body = await bodyOfRejection(
        service.criar(sessao({ roles: ['CLIENT'] }), { name: 'Aluno' }),
      );
      expect(body).toEqual({ error: 'Apenas treinadores podem adicionar alunos.' });
    });

    it('[controle] admin sem ser treinador ainda assim pode criar', async () => {
      await service.criar(sessao({ roles: ['CLIENT'], isAdmin: true }), { name: 'Aluno' });
      expect(prisma.student.create).toHaveBeenCalled();
    });

    it('sem nome → 400', async () => {
      // Corpo inválido de propósito (dupla barreira D104).
      const body = await bodyOfRejection(service.criar(sessao(), {} as never));
      expect(body).toEqual({ error: 'Nome do aluno é obrigatório' });
    });

    it('nome maior que 100 caracteres → 400', async () => {
      const body = await bodyOfRejection(service.criar(sessao(), { name: 'a'.repeat(101) }));
      expect(body).toEqual({ error: 'Nome deve ter entre 1 e 100 caracteres.' });
    });

    it('cria o aluno com o esporte informado por sportId', async () => {
      prisma.sport.findUnique.mockResolvedValue({ id: 'sport-x' });
      await service.criar(sessao(), { name: 'Aluno', sportId: 'sport-x' });
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ athleteProfiles: { create: { sportId: 'sport-x', position: '' } } }),
        }),
      );
    });

    it('sem esporte informado, cai no primeiro ativo ordenado por nome', async () => {
      await service.criar(sessao(), { name: 'Aluno' });
      expect(prisma.sport.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      );
    });

    it('nenhum esporte cadastrado no sistema → 500 com mensagem explícita', async () => {
      prisma.sport.findFirst.mockResolvedValue(null);
      const body = await bodyOfRejection(service.criar(sessao(), { name: 'Aluno' }));
      expect(body).toEqual({ error: 'Erro: Nenhum esporte cadastrado no sistema.' });
    });

    it('email de um usuário já cadastrado vincula userId automaticamente', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-existente' });
      await service.criar(sessao(), { name: 'Aluno', email: 'Ja@Existe.com' });
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-existente', email: 'ja@existe.com' }) }),
      );
    });

    it('com email, dispara convite (upsert de AthleteInvite + e-mail)', async () => {
      await service.criar(sessao(), { name: 'Aluno', email: 'aluno@example.com' });
      await Promise.resolve(); // deixa o void .catch() da chamada fire-and-forget assentar
      expect(prisma.athleteInvite.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email_trainerId: { email: 'aluno@example.com', trainerId: EU } },
        }),
      );
      expect(email.enviarConviteDeAtleta).toHaveBeenCalled();
    });

    it('sem email, não tenta convite nenhum', async () => {
      await service.criar(sessao(), { name: 'Aluno' });
      expect(prisma.athleteInvite.upsert).not.toHaveBeenCalled();
      expect(email.enviarConviteDeAtleta).not.toHaveBeenCalled();
    });

    /* ── D83 (legado) + D102 (fatia 29) — limite unificado admin → partner → SaaS → free ── */

    it('D83: tier parceiro com maxAthletes null → ilimitado, não conta nem bloqueia', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ tier: { maxAthletes: null } });
      await service.criar(sessao(), { name: 'Aluno' });
      expect(prisma.student.count).not.toHaveBeenCalled();
      expect(prisma.student.create).toHaveBeenCalled();
    });

    it('D83: tier com limite numérico, abaixo do limite → permite', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ tier: { maxAthletes: 5 } });
      prisma.student.count.mockResolvedValue(4);
      await service.criar(sessao(), { name: 'Aluno' });
      expect(prisma.student.create).toHaveBeenCalled();
    });

    it('D83: tier com limite numérico, no limite → 403', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ tier: { maxAthletes: 5 } });
      prisma.student.count.mockResolvedValue(5);
      const body = await bodyOfRejection(service.criar(sessao(), { name: 'Aluno' }));
      expect(body).toEqual({ error: 'Limite de 5 alunos atingido para o seu plano de parceiro.' });
      expect(prisma.student.create).not.toHaveBeenCalled();
    });

    it('D83: parceiro sem tier atribuído cai no fallback do tier starter', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ tier: null });
      prisma.partnerTier.findFirst.mockResolvedValue({ maxAthletes: 3 });
      prisma.student.count.mockResolvedValue(3);
      const body = await bodyOfRejection(service.criar(sessao(), { name: 'Aluno' }));
      expect(prisma.partnerTier.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'starter', isActive: true } }),
      );
      expect(body).toEqual({ error: 'Limite de 3 alunos atingido para o seu plano de parceiro.' });
    });

    it('D83: admin ignora o limite mesmo sem PartnerAccount', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      await service.criar(sessao({ isAdmin: true }), { name: 'Aluno' });
      expect(prisma.student.create).toHaveBeenCalled();
    });

    /* ── Fatia 29 (D102) — caminho SaaS unificado ── */

    it('D102: SaaS com tier ativo e espaço → cria (não só parceiro)', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      prisma.saaSTier.findFirst.mockResolvedValue({ maxAthletes: 3, maxPlansPerMonth: 10 });
      prisma.student.count.mockResolvedValue(0);
      await service.criar(sessao(), { name: 'Aluno' });
      expect(prisma.student.create).toHaveBeenCalled();
    });

    it('D102: SaaS no limite → 403 com mensagem SaaS', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      prisma.saaSTier.findFirst.mockResolvedValue({ maxAthletes: 3, maxPlansPerMonth: 10 });
      prisma.student.count.mockResolvedValue(3);
      const body = await bodyOfRejection(service.criar(sessao(), { name: 'Aluno' }));
      expect(body).toEqual({ error: 'Limite de 3 atletas atingido. Faça upgrade para o plano Premium.' });
      expect(prisma.student.create).not.toHaveBeenCalled();
    });

    it('D102: free (sem parceiro, sem plano) → 403 pedindo upgrade', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      prisma.saaSTier.findFirst.mockResolvedValue(null);
      const body = await bodyOfRejection(service.criar(sessao({ subscriptionPlan: null }), { name: 'Aluno' }));
      expect(body).toEqual({ error: 'Limite de 0 atletas atingido. Faça upgrade para o plano Premium.' });
      expect(prisma.student.create).not.toHaveBeenCalled();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * buscar
   * ──────────────────────────────────────────────────────────────────────── */

  describe('buscar', () => {
    beforeEach(() => {
      prisma.trainingPlan.findMany.mockResolvedValue([]);
      prisma.trainingPlan.count.mockResolvedValue(0);
    });

    it('dono vê o próprio aluno', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow());
      const r = await service.buscar('student-1', sessao(), {});
      expect(r.student.id).toBe('student-1');
    });

    it('aluno de outro treinador, sem ser admin → 404', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow({ trainerId: OUTRO }));
      const body = await bodyOfRejection(service.buscar('student-1', sessao(), {}));
      expect(body).toEqual({ error: 'Aluno não encontrado ou sem permissão' });
    });

    it('[controle] admin vê aluno de outro treinador', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow({ trainerId: OUTRO }));
      const r = await service.buscar('student-1', sessao({ isAdmin: true }), {});
      expect(r.student.id).toBe('student-1');
    });

    it('aluno inexistente → 404', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.buscar('inexistente', sessao(), {}));
      expect(body).toEqual({ error: 'Aluno não encontrado ou sem permissão' });
    });

    it('calcula progresso (percent) a partir das sessões concluídas', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow());
      prisma.trainingPlan.findMany.mockResolvedValue([
        {
          id: 'plan-1',
          trainingSessions: [{ completed: true }, { completed: true }, { completed: false }, { completed: false }],
        },
      ]);
      const r = await service.buscar('student-1', sessao(), {});
      expect(r.plans[0].progress).toEqual({ total: 4, completed: 2, percent: 50 });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * remover
   * ──────────────────────────────────────────────────────────────────────── */

  describe('remover', () => {
    it('dono remove o próprio aluno', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow());
      const r = await service.remover('student-1', sessao());
      expect(r).toEqual({ message: 'Aluno removido da sua lista com sucesso' });
      expect(prisma.student.delete).toHaveBeenCalledWith({ where: { id: 'student-1' } });
    });

    it('aluno de outro treinador, sem ser admin → 404', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow({ trainerId: OUTRO }));
      const body = await bodyOfRejection(service.remover('student-1', sessao()));
      expect(body).toEqual({ error: 'Aluno não encontrado' });
      expect(prisma.student.delete).not.toHaveBeenCalled();
    });

    it('[controle] admin remove aluno de outro treinador', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow({ trainerId: OUTRO }));
      await service.remover('student-1', sessao({ isAdmin: true }));
      expect(prisma.student.delete).toHaveBeenCalled();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * atualizarPerfil
   * ──────────────────────────────────────────────────────────────────────── */

  describe('atualizarPerfil', () => {
    beforeEach(() => {
      prisma.athleteProfile.findMany.mockResolvedValue([]);
      prisma.athleteProfile.create.mockResolvedValue({ id: 'ap-novo' });
      prisma.athleteProfile.update.mockResolvedValue({ id: 'ap-existente' });
    });

    it('aluno de outro treinador → 403 (não 404 — paridade com o legado)', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow({ trainerId: OUTRO }));
      const body = await bodyOfRejection(
        service.atualizarPerfil('student-1', sessao(), { sports: [{ sportId: 'sport-1' }] }),
      );
      expect(body).toEqual({ error: 'Aluno não encontrado ou sem permissão' });
    });

    it('sem esportes → 400', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow());
      const body = await bodyOfRejection(service.atualizarPerfil('student-1', sessao(), { sports: [] }));
      expect(body).toEqual({ error: 'Ao menos um esporte é obrigatório' });
    });

    it('mais de 5 esportes → 400', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow());
      const sports = Array.from({ length: 6 }, (_, i) => ({ sportId: `sport-${i}` }));
      const body = await bodyOfRejection(service.atualizarPerfil('student-1', sessao(), { sports }));
      expect(body).toEqual({ error: 'Limite de esportes por perfil excedido (Máx: 5)' });
    });

    it('cria perfil novo para esporte sem ficha existente', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow());
      await service.atualizarPerfil('student-1', sessao(), { sports: [{ sportId: 'sport-1' }] });
      expect(prisma.athleteProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ studentId: 'student-1', sportId: 'sport-1' }) }),
      );
    });

    it('atualiza perfil existente em vez de criar duplicata', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow());
      prisma.athleteProfile.findMany.mockResolvedValue([{ id: 'ap-1', sportId: 'sport-1', teams: [] }]);
      await service.atualizarPerfil('student-1', sessao(), { sports: [{ sportId: 'sport-1' }] });
      expect(prisma.athleteProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ap-1' } }),
      );
      expect(prisma.athleteProfile.create).not.toHaveBeenCalled();
    });

    it('remove fichas de esportes que saíram da lista enviada', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow());
      prisma.athleteProfile.findMany.mockResolvedValue([
        { id: 'ap-1', sportId: 'sport-1', teams: [] },
        { id: 'ap-2', sportId: 'sport-2', teams: [] },
      ]);
      await service.atualizarPerfil('student-1', sessao(), { sports: [{ sportId: 'sport-1' }] });
      expect(prisma.athleteProfile.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['ap-2'] } } });
    });

    it('altura fora da faixa é clampada entre 50 e 300', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow());
      await service.atualizarPerfil('student-1', sessao(), { sports: [{ sportId: 'sport-1' }], height: 999 });
      expect(prisma.athleteProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ height: 300 }) }),
      );
    });

    it('[controle] altura dentro da faixa não é alterada', async () => {
      prisma.student.findUnique.mockResolvedValue(studentRow());
      await service.atualizarPerfil('student-1', sessao(), { sports: [{ sportId: 'sport-1' }], height: 180 });
      expect(prisma.athleteProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ height: 180 }) }),
      );
    });
  });
});
