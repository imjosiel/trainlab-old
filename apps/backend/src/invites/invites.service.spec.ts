import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { InvitesService } from './invites.service';

function prismaMock() {
  return {
    athleteInvite: { findUnique: jest.fn(), updateMany: jest.fn() },
    trainerAthlete: { upsert: jest.fn() },
    student: { update: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: Record<string, unknown>) => unknown) => {
      const tx = {
        athleteInvite: { updateMany: prisma.athleteInvite.updateMany },
        trainerAthlete: { upsert: prisma.trainerAthlete.upsert },
        student: { update: prisma.student.update },
        user: { findUnique: prisma.user.findUnique, update: prisma.user.update },
      };
      return cb(tx);
    }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any;

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: 'user-1',
    name: 'Aluno',
    email: 'aluno@example.com',
    image: null,
    roles: ['PENDING'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: null,
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

async function bodyOfRejection(promise: Promise<unknown>): Promise<{ body: Record<string, unknown>; status: number }> {
  try {
    await promise;
    throw new Error('esperava rejeição, mas resolveu');
  } catch (err) {
    if (!(err instanceof HttpException)) throw err;
    return { body: err.getResponse() as Record<string, unknown>, status: err.getStatus() };
  }
}

function convite(over: Record<string, unknown> = {}) {
  const futuro = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    token: 'tok-1',
    email: 'aluno@example.com',
    trainerId: 'trainer-1',
    studentId: null,
    accepted: false,
    expiresAt: futuro,
    ...over,
  };
}

/**
 * Fatia 32 (lote 1) — RED. Invites: get + aceitar.
 */
describe('InvitesService', () => {
  let service: InvitesService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new InvitesService(prisma as any);
  });

  describe('get', () => {
    it('token inexistente → 404', async () => {
      prisma.athleteInvite.findUnique.mockResolvedValue(null);
      const { body } = await bodyOfRejection(service.get('x'));
      expect(body).toEqual({ error: 'Convite não encontrado' });
    });

    it('convite aceito → 410', async () => {
      prisma.athleteInvite.findUnique.mockResolvedValue(
        convite({ accepted: true, trainer: { name: 'T', email: 't@e.c', image: null } }),
      );
      const { body, status } = await bodyOfRejection(service.get('tok-1'));
      expect(status).toBe(410);
      expect(body).toEqual({ error: 'Este convite já foi aceito' });
    });

    it('convite expirado → 410', async () => {
      prisma.athleteInvite.findUnique.mockResolvedValue(
        convite({ expiresAt: new Date(Date.now() - 1000), trainer: { name: 'T' } }),
      );
      const { status } = await bodyOfRejection(service.get('tok-1'));
      expect(status).toBe(410);
    });

    it('[controle] convite válido devolve email + treinador, sem token', async () => {
      prisma.athleteInvite.findUnique.mockResolvedValue(
        convite({ trainer: { name: 'Treinador', email: 't@e.c', image: null } }),
      );
      const r = await service.get('tok-1');
      expect(r.invite).toMatchObject({ email: 'aluno@example.com', trainerName: 'Treinador' });
      expect(JSON.stringify(r)).not.toContain('tok-1');
    });
  });

  describe('aceitar', () => {
    beforeEach(() => {
      prisma.athleteInvite.findUnique.mockResolvedValue(convite());
      prisma.athleteInvite.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue({ roles: ['PENDING'] });
    });

    it('email trocado → 403', async () => {
      const { body, status } = await bodyOfRejection(
        service.aceitar('tok-1', sessao({ email: 'outro@example.com' })),
      );
      expect(status).toBe(403);
      expect(body).toEqual({ error: 'Este convite foi enviado para outro e-mail.' });
    });

    it('corrida perdida (count 0) → 410', async () => {
      prisma.athleteInvite.updateMany.mockResolvedValue({ count: 0 });
      const { status } = await bodyOfRejection(service.aceitar('tok-1', sessao()));
      expect(status).toBe(410);
    });

    it('[controle] aceita, vincula TrainerAthlete e concede CLIENT sem PENDING', async () => {
      const r = await service.aceitar('tok-1', sessao());
      expect(r).toMatchObject({ message: expect.stringMatching(/sucesso/i) });
      expect(prisma.trainerAthlete.upsert).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { roles: ['CLIENT'] } }),
      );
    });
  });
});
