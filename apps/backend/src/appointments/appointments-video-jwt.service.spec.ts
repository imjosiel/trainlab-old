import { createHmac, timingSafeEqual } from 'crypto';
import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { AppointmentsService } from './appointments.service';

/**
 * Fatia 38 — RED. Moderador garantido via JWT (mint ainda não existe).
 *
 * Padrão da casa: asserção de chamada antes de asserção de conteúdo (A63).
 * O `moderator` é decidido no AppointmentsService (tem o agendamento),
 * nunca no corpo da requisição.
 */

function prismaMock() {
  return {
    appointment: { findUnique: jest.fn(), update: jest.fn() },
    student: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    trainerAthlete: { findFirst: jest.fn() },
  };
}

function videoMock() {
  return { criarSala: jest.fn(), mintJitsiToken: jest.fn() };
}

function calendarMock() {
  return { criarEvento: jest.fn(), atualizarEvento: jest.fn(), apagarEvento: jest.fn() };
}

function notificationsMock() {
  return { criar: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
}

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: 'trainer-1',
    name: 'Treinador',
    email: 't@example.com',
    roles: ['PROFESSIONAL'],
    systemRoles: ['USER'],
    isAdmin: false,
    ...over,
  } as SessionPayload;
}

function decodificar(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function ehHmacValido(token: string, segredo: string): boolean {
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  const esperado = createHmac('sha256', segredo).update(`${partes[0]}.${partes[1]}`).digest('base64url');
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(partes[2], 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const APT_JITSI_PROPRIO = {
  id: 'appt-1',
  trainerId: 'trainer-1',
  athleteId: 'atleta-1',
  student: null,
  videoProvider: 'jitsi',
  videoRoomName: 'trainlab-appt01-abcdef0123456789',
  videoJoinUrl: 'https://meet.exemplo.com/trainlab-appt01-abcdef0123456789',
  scheduledAt: new Date('2099-05-01T10:00:00Z'),
  durationMinutes: 60,
};

const APT_JITSI_PUBLICO = { ...APT_JITSI_PROPRIO, videoJoinUrl: 'https://meet.jit.si/trainlab-appt01-abcdef0123456789' };

const OLD_ENV = process.env;

describe('AppointmentsService.lerSalaDeVideo com JWT (fatia 38 — RED)', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    process.env.JITSI_DOMAIN = 'meet.exemplo.com';
    process.env.JITSI_APP_ID = 'trainlab';
    process.env.JITSI_JWT_SECRET = 'segredo-teste';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  function montar(prisma: ReturnType<typeof prismaMock>, video: ReturnType<typeof videoMock>) {
    return new AppointmentsService(
      prisma as never,
      calendarMock() as never,
      notificationsMock() as never,
      video as never,
    );
  }

  it('dono → token com moderator true; atendido → moderator false', async () => {
    const prisma = prismaMock();
    prisma.appointment.findUnique.mockResolvedValue({ ...APT_JITSI_PROPRIO });
    const video = videoMock();
    video.mintJitsiToken.mockImplementation(
      async (args: { moderator: boolean }) => `tok-${args.moderator ? 'mod' : 'aluno'}`,
    );
    const service = montar(prisma, video);

    const dono = await service.lerSalaDeVideo('appt-1', sessao());
    expect(video.mintJitsiToken).toHaveBeenCalledTimes(1);
    expect(video.mintJitsiToken.mock.calls[0][0]).toMatchObject({ moderator: true });
    expect(dono).toMatchObject({ token: 'tok-mod' });

    video.mintJitsiToken.mockClear();
    const atendido = await service.lerSalaDeVideo('appt-1', sessao({ id: 'atleta-1', roles: ['CLIENT'] }));
    expect(video.mintJitsiToken).toHaveBeenCalledTimes(1);
    expect(video.mintJitsiToken.mock.calls[0][0]).toMatchObject({ moderator: false });
    expect(atendido).toMatchObject({ token: 'tok-aluno' });
  });

  it('admin → moderator true mesmo sem ser dono', async () => {
    const prisma = prismaMock();
    prisma.appointment.findUnique.mockResolvedValue({ ...APT_JITSI_PROPRIO });
    const video = videoMock();
    video.mintJitsiToken.mockResolvedValue('tok-admin');
    const service = montar(prisma, video);

    await service.lerSalaDeVideo('appt-1', sessao({ id: 'admin-1', isAdmin: true, systemRoles: ['ADMIN'] }));
    expect(video.mintJitsiToken).toHaveBeenCalledTimes(1);
    expect(video.mintJitsiToken.mock.calls[0][0]).toMatchObject({ moderator: true });
  });

  it('não-participante → 403 antes de qualquer mint', async () => {
    const prisma = prismaMock();
    prisma.appointment.findUnique.mockResolvedValue({ ...APT_JITSI_PROPRIO });
    const video = videoMock();
    const service = montar(prisma, video);

    let status = 0;
    try {
      await service.lerSalaDeVideo('appt-1', sessao({ id: 'intruso' }));
      throw new Error('esperava rejeição, mas resolveu');
    } catch (err) {
      if (!(err instanceof HttpException)) throw err;
      status = err.getStatus();
    }
    expect(status).toBe(403);
    expect(video.mintJitsiToken).not.toHaveBeenCalled();
  });

  it('meet.jit.si → sem token mesmo com segredo configurado', async () => {
    const prisma = prismaMock();
    prisma.appointment.findUnique.mockResolvedValue({ ...APT_JITSI_PUBLICO });
    const video = videoMock();
    const service = montar(prisma, video);

    const r = await service.lerSalaDeVideo('appt-1', sessao());
    expect(video.mintJitsiToken).not.toHaveBeenCalled();
    expect(r).not.toHaveProperty('token');
    expect(r).toMatchObject({ provider: 'jitsi' });
  });

  it('domínio próprio sem segredo → sem token, sem erro', async () => {
    delete process.env.JITSI_JWT_SECRET;
    const prisma = prismaMock();
    prisma.appointment.findUnique.mockResolvedValue({ ...APT_JITSI_PROPRIO });
    const video = videoMock();
    const service = montar(prisma, video);

    const r = await service.lerSalaDeVideo('appt-1', sessao());
    expect(video.mintJitsiToken).not.toHaveBeenCalled();
    expect(r).not.toHaveProperty('token');
  });

  it('token real é HMAC válido com room exato (integração VideoService de verdade)', async () => {
    const prisma = prismaMock();
    prisma.appointment.findUnique.mockResolvedValue({ ...APT_JITSI_PROPRIO });
    const { VideoService } = await import('@/video/video.service');
    const videoReal = new VideoService();
    const service = montar(prisma, videoReal as never);

    const r = (await service.lerSalaDeVideo('appt-1', sessao())) as { token?: string };
    expect(typeof r.token).toBe('string');
    expect(ehHmacValido(r.token as string, 'segredo-teste')).toBe(true);
    expect(decodificar(r.token as string)).toMatchObject({
      room: 'trainlab-appt01-abcdef0123456789',
      context: { user: { moderator: true } },
    });
  });
});
