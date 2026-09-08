import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { AppointmentsService } from './appointments.service';

/**
 * Fatia 37 — RED. Vídeo no AppointmentsService (ainda não existe).
 *
 * Padrão da casa: mocks manuais, sem `.catch(() => {})` que mascare ausência
 * (lição A63) — asserção de chamada antes de asserção de conteúdo.
 */

function prismaMock() {
  return {
    appointment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    student: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    trainerAthlete: { findFirst: jest.fn() },
  };
}

function videoMock() {
  return { criarSala: jest.fn() };
}

function calendarMock() {
  return {
    criarEvento: jest.fn(),
    atualizarEvento: jest.fn(),
    apagarEvento: jest.fn(),
  };
}

function notificationsMock() {
  return { criar: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
}

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: 'trainer-1',
    roles: ['PROFESSIONAL'],
    systemRoles: ['USER'],
    isAdmin: false,
    ...over,
  } as SessionPayload;
}

async function corpoDoErro(promise: Promise<unknown>): Promise<{ status: number; corpo: unknown }> {
  try {
    await promise;
    throw new Error('esperava rejeição, mas resolveu');
  } catch (err) {
    if (!(err instanceof HttpException)) throw err;
    return { status: err.getStatus(), corpo: err.getResponse() };
  }
}

const APT_BASE = {
  id: 'appt-1',
  trainerId: 'trainer-1',
  athleteId: null,
  student: null,
  videoProvider: null,
  videoRoomName: null,
  videoJoinUrl: null,
};

describe('AppointmentsService.criarSalaDeVideo (fatia 37 — RED)', () => {
  it('sem sala → cria, persiste os 3 campos, responde video', async () => {
    const prisma = prismaMock();
    prisma.appointment.findUnique.mockResolvedValue({ ...APT_BASE });
    prisma.appointment.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...APT_BASE,
      ...data,
    }));
    const video = videoMock();
    video.criarSala.mockResolvedValue({
      provider: 'jitsi',
      roomName: 'trainlab-appt-1-abc',
      joinUrl: 'https://meet.jit.si/trainlab-appt-1-abc',
    });
    const service = new AppointmentsService(
      prisma as never,
      calendarMock() as never,
      notificationsMock() as never,
      video as never,
    );

    const r = await service.criarSalaDeVideo('appt-1', sessao(), {});

    expect(video.criarSala).toHaveBeenCalledTimes(1);
    expect(prisma.appointment.update).toHaveBeenCalledTimes(1);
    const gravado = prisma.appointment.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(gravado.videoProvider).toBe('jitsi');
    expect(gravado.videoRoomName).toBe('trainlab-appt-1-abc');
    expect(gravado.videoJoinUrl).toBe('https://meet.jit.si/trainlab-appt-1-abc');
    expect(r.video).toMatchObject({ provider: 'jitsi' });
    expect(r.videoNotAvailable).toBeFalsy();
  });

  it('segunda chamada → não chama o VideoService, devolve a mesma sala', async () => {
    const prisma = prismaMock();
    prisma.appointment.findUnique.mockResolvedValue({
      ...APT_BASE,
      videoProvider: 'daily',
      videoRoomName: 'trainlab-x',
      videoJoinUrl: 'https://x.daily.co/trainlab-x',
    });
    const video = videoMock();
    const service = new AppointmentsService(
      prisma as never,
      calendarMock() as never,
      notificationsMock() as never,
      video as never,
    );

    const r = await service.criarSalaDeVideo('appt-1', sessao(), {});

    expect(video.criarSala).not.toHaveBeenCalled();
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(r.video).toMatchObject({ provider: 'daily', roomName: 'trainlab-x' });
  });

  it('não-participante → 403', async () => {
    const prisma = prismaMock();
    prisma.appointment.findUnique.mockResolvedValue({ ...APT_BASE });
    const service = new AppointmentsService(
      prisma as never,
      calendarMock() as never,
      notificationsMock() as never,
      videoMock() as never,
    );

    const { status } = await corpoDoErro(
      service.criarSalaDeVideo('appt-1', sessao({ id: 'intruso' }), {}),
    );
    expect(status).toBe(403);
  });

  it('inexistente → 404', async () => {
    const prisma = prismaMock();
    prisma.appointment.findUnique.mockResolvedValue(null);
    const service = new AppointmentsService(
      prisma as never,
      calendarMock() as never,
      notificationsMock() as never,
      videoMock() as never,
    );

    const { status } = await corpoDoErro(service.criarSalaDeVideo('nope', sessao(), {}));
    expect(status).toBe(404);
  });

  it('falha do VideoService → 200 com videoNotAvailable (espelha o Meet)', async () => {
    const prisma = prismaMock();
    prisma.appointment.findUnique.mockResolvedValue({ ...APT_BASE });
    const video = videoMock();
    video.criarSala.mockRejectedValue(new Error('daily fora do ar'));
    const service = new AppointmentsService(
      prisma as never,
      calendarMock() as never,
      notificationsMock() as never,
      video as never,
    );

    const r = await service.criarSalaDeVideo('appt-1', sessao(), {});
    expect(r.video).toBeNull();
    expect(r.videoNotAvailable).toBe(true);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('lerSalaDeVideo sem sala → 404; com sala → provider/room/join', async () => {
    const prisma = prismaMock();
    const service = new AppointmentsService(
      prisma as never,
      calendarMock() as never,
      notificationsMock() as never,
      videoMock() as never,
    );

    prisma.appointment.findUnique.mockResolvedValue({ ...APT_BASE });
    const sem = await corpoDoErro(service.lerSalaDeVideo('appt-1', sessao()));
    expect(sem.status).toBe(404);

    prisma.appointment.findUnique.mockResolvedValue({
      ...APT_BASE,
      videoProvider: 'jitsi',
      videoRoomName: 'r',
      videoJoinUrl: 'https://meet.jit.si/r',
    });
    const com = await service.lerSalaDeVideo('appt-1', sessao());
    expect(com).toMatchObject({ provider: 'jitsi', roomName: 'r' });
  });
});
