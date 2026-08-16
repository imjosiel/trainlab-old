import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { StudentInvitesService } from './student-invites.service';

function prismaMock() {
  return {
    user: { findUnique: jest.fn() },
    trainerAthlete: { findFirst: jest.fn() },
    athleteInvite: { upsert: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    student: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    athleteProfile: { update: jest.fn(), delete: jest.fn() },
    notification: { findMany: jest.fn(), update: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
    sport: { findUnique: jest.fn() },
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
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

describe('StudentInvitesService', () => {
  let prisma: PrismaMock;
  let email: ReturnType<typeof emailMock>;
  let notifications: ReturnType<typeof notificationsMock>;
  let service: StudentInvitesService;

  beforeEach(() => {
    prisma = prismaMock();
    email = emailMock();
    notifications = notificationsMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new StudentInvitesService(prisma as any, email as any, notifications as any);

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.athleteInvite.upsert.mockResolvedValue({ id: 'invite-1' });
    prisma.athleteInvite.findUnique.mockResolvedValue(null);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * convidarAtleta — POST /students/invite
   * ──────────────────────────────────────────────────────────────────────── */

  describe('convidarAtleta', () => {
    it('quem não é treinador → 403', async () => {
      const body = await bodyOfRejection(service.convidarAtleta(sessao({ roles: ['CLIENT'] }), 'a@a.com'));
      expect(body).toEqual({ error: 'Apenas treinadores podem enviar convites' });
    });

    it('sem email → 400', async () => {
      const body = await bodyOfRejection(service.convidarAtleta(sessao(), undefined));
      expect(body).toEqual({ error: 'Email é obrigatório' });
    });

    it('email com formato inválido → 400', async () => {
      const body = await bodyOfRejection(service.convidarAtleta(sessao(), 'não-é-email'));
      expect(body).toEqual({ error: 'Formato de email inválido' });
    });

    it('atleta já vinculado (TrainerAthlete existente) → 409', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'atleta-1' });
      prisma.trainerAthlete.findFirst.mockResolvedValue({ id: 'ta-1' });
      const body = await bodyOfRejection(service.convidarAtleta(sessao(), 'atleta@example.com'));
      expect(body).toEqual({ error: 'Este atleta já está vinculado à sua conta' });
    });

    it('[controle] usuário existe mas ainda não vinculado a este treinador → segue', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'atleta-1' });
      prisma.trainerAthlete.findFirst.mockResolvedValue(null);
      await service.convidarAtleta(sessao(), 'atleta@example.com');
      expect(prisma.athleteInvite.upsert).toHaveBeenCalled();
    });

    it('upsert do convite não grava studentId (fluxo é para atleta registrado, não Student virtual)', async () => {
      await service.convidarAtleta(sessao(), 'atleta@example.com');
      const chamada = prisma.athleteInvite.upsert.mock.calls[0][0];
      expect(chamada.create).not.toHaveProperty('studentId');
      expect(chamada.update).not.toHaveProperty('studentId');
    });

    it('envia o e-mail de convite', async () => {
      await service.convidarAtleta(sessao(), 'atleta@example.com');
      expect(email.enviarConviteDeAtleta).toHaveBeenCalledWith(
        expect.objectContaining({ athleteEmail: 'atleta@example.com' }),
      );
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * convidarParaAluno — POST /students/:id/invite
   * ──────────────────────────────────────────────────────────────────────── */

  describe('convidarParaAluno', () => {
    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue({ id: 'student-1', trainerId: EU, userId: null, name: 'Aluno' });
    });

    it('aluno de outro treinador → 404', async () => {
      prisma.student.findUnique.mockResolvedValue({ id: 'student-1', trainerId: 'outro', userId: null });
      const body = await bodyOfRejection(service.convidarParaAluno('student-1', sessao(), 'a@a.com'));
      expect(body).toEqual({ error: 'Aluno não encontrado ou sem permissão' });
    });

    it('aluno já vinculado a uma conta → 400', async () => {
      prisma.student.findUnique.mockResolvedValue({ id: 'student-1', trainerId: EU, userId: 'ja-vinculado' });
      const body = await bodyOfRejection(service.convidarParaAluno('student-1', sessao(), 'a@a.com'));
      expect(body).toEqual({ error: 'Este aluno já possui uma conta vinculada.' });
    });

    // D84 — cooldown via updatedAt direto, não mais via expiresAt - 7 dias.
    it('D84: reenvio antes de 60s (updatedAt recente) → 429', async () => {
      prisma.athleteInvite.findUnique.mockResolvedValue({ updatedAt: new Date(Date.now() - 5_000) });
      const body = await bodyOfRejection(service.convidarParaAluno('student-1', sessao(), 'a@a.com'));
      expect(body).toEqual({ error: 'Muitas tentativas. Aguarde 1 minuto para reenviar o convite.' });
    });

    it('D84: [controle] updatedAt com mais de 60s → permite reenviar', async () => {
      prisma.athleteInvite.findUnique.mockResolvedValue({ updatedAt: new Date(Date.now() - 61_000) });
      await service.convidarParaAluno('student-1', sessao(), 'a@a.com');
      expect(prisma.athleteInvite.upsert).toHaveBeenCalled();
    });

    it('grava o email no Student e faz upsert do convite COM studentId', async () => {
      await service.convidarParaAluno('student-1', sessao(), 'Aluno@Example.com');
      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 'student-1' },
        data: { email: 'aluno@example.com' },
      });
      const chamada = prisma.athleteInvite.upsert.mock.calls[0][0];
      expect(chamada.create).toHaveProperty('studentId', 'student-1');
      expect(chamada.update).toHaveProperty('studentId', 'student-1');
    });

    // D85 — notificação nunca derruba o convite.
    it('D85: falha ao notificar não impede o convite de ser enviado com sucesso', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usuario-existente' });
      notifications.criar.mockRejectedValue(new Error('banco de notificações fora do ar'));

      const r = await service.convidarParaAluno('student-1', sessao(), 'existente@example.com');
      await Promise.resolve();

      expect(r).toEqual({ message: 'Convite enviado com sucesso!' });
    });

    it('usuário com esse email já existe → notifica', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'usuario-existente' });
      await service.convidarParaAluno('student-1', sessao(), 'existente@example.com');
      await Promise.resolve();
      expect(notifications.criar).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usuario-existente', type: 'STUDENT_INVITE' }),
      );
    });

    it('[controle] sem usuário existente, não notifica', async () => {
      await service.convidarParaAluno('student-1', sessao(), 'novo@example.com');
      expect(notifications.criar).not.toHaveBeenCalled();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * aceitarConvite — POST /students/invite/accept
   * ──────────────────────────────────────────────────────────────────────── */

  describe('aceitarConvite', () => {
    const inviteBase = {
      id: 'invite-1',
      studentId: 'student-1',
      expiresAt: new Date(Date.now() + 60_000),
    };

    beforeEach(() => {
      prisma.athleteInvite.findUnique.mockResolvedValue(inviteBase);
      prisma.student.findUnique.mockResolvedValue({ id: 'student-1', athleteProfiles: [] });
      prisma.systemSettings.findFirst.mockResolvedValue(null);
      prisma.athleteInvite.updateMany.mockResolvedValue({ count: 1 });
      prisma.notification.findMany.mockResolvedValue([]);
    });

    it('token inexistente → 404', async () => {
      prisma.athleteInvite.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.aceitarConvite(sessao(), 'token-x'));
      expect(body).toEqual({ error: 'Convite não encontrado' });
    });

    it('convite expirado → 400', async () => {
      prisma.athleteInvite.findUnique.mockResolvedValue({ ...inviteBase, expiresAt: new Date(Date.now() - 1000) });
      const body = await bodyOfRejection(service.aceitarConvite(sessao(), 'token-x'));
      expect(body).toEqual({ error: 'Este convite expirou' });
    });

    it('convite sem studentId (fluxo de atleta registrado) → 400', async () => {
      prisma.athleteInvite.findUnique.mockResolvedValue({ ...inviteBase, studentId: null });
      const body = await bodyOfRejection(service.aceitarConvite(sessao(), 'token-x'));
      expect(body).toEqual({ error: 'Convite corrompido: Sem Aluno vinculado' });
    });

    it('aluno original apagado → 404', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.aceitarConvite(sessao(), 'token-x'));
      expect(body).toEqual({ error: 'Aluno original não encontrado' });
    });

    it('trava atômica: segunda aceitação do mesmo convite → 400', async () => {
      prisma.athleteInvite.updateMany.mockResolvedValue({ count: 0 });
      const body = await bodyOfRejection(service.aceitarConvite(sessao(), 'token-x'));
      expect(body).toEqual({ error: 'Este convite já foi processado e aceito' });
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('vincula o userId ao Student', async () => {
      await service.aceitarConvite(sessao(), 'token-x');
      expect(prisma.student.update).toHaveBeenCalledWith({ where: { id: 'student-1' }, data: { userId: EU } });
    });

    it('merge de AthleteProfile sem dono: vincula ao usuário', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        athleteProfiles: [{ id: 'ap-1', userId: null, sportId: 'sport-1' }],
      });
      await service.aceitarConvite(sessao(), 'token-x');
      expect(prisma.athleteProfile.update).toHaveBeenCalledWith({ where: { id: 'ap-1' }, data: { userId: EU } });
    });

    it('conflito de merge (usuário já tem ficha nesse esporte) → remove a ficha duplicada', async () => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        athleteProfiles: [{ id: 'ap-1', userId: null, sportId: 'sport-1' }],
      });
      prisma.athleteProfile.update.mockRejectedValue(new Error('unique constraint'));
      await service.aceitarConvite(sessao(), 'token-x');
      expect(prisma.athleteProfile.delete).toHaveBeenCalledWith({ where: { id: 'ap-1' } });
    });

    it('multiplos treinadores desabilitado + esporte sobreposto → 400', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ allowMultipleTrainersPerSport: false });
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        athleteProfiles: [{ id: 'ap-1', userId: null, sportId: 'sport-futebol' }],
      });
      prisma.student.findMany.mockResolvedValue([
        { id: 'student-existente', athleteProfiles: [{ sportId: 'sport-futebol' }] },
      ]);
      prisma.sport.findUnique.mockResolvedValue({ id: 'sport-futebol', name: 'Futebol' });

      const body = await bodyOfRejection(service.aceitarConvite(sessao(), 'token-x'));
      expect(body).toEqual({ error: 'Você já possui um treinador ativo para a modalidade Futebol.' });
    });

    it('[controle] multiplos treinadores permitido → não bloqueia mesmo com sobreposição', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({ allowMultipleTrainersPerSport: true });
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        athleteProfiles: [{ id: 'ap-1', userId: null, sportId: 'sport-futebol' }],
      });
      await expect(service.aceitarConvite(sessao(), 'token-x')).resolves.toBeDefined();
    });

    it('marca a notificação de convite correspondente como lida', async () => {
      prisma.notification.findMany.mockResolvedValue([
        { id: 'notif-1', metadata: { token: 'token-x' } },
        { id: 'notif-2', metadata: { token: 'outro-token' } },
      ]);
      await service.aceitarConvite(sessao(), 'token-x');
      expect(prisma.notification.update).toHaveBeenCalledWith({ where: { id: 'notif-1' }, data: { isRead: true } });
    });

    it('[controle] nenhuma notificação com esse token → não atualiza nada', async () => {
      prisma.notification.findMany.mockResolvedValue([{ id: 'notif-2', metadata: { token: 'outro-token' } }]);
      await service.aceitarConvite(sessao(), 'token-x');
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });
});
