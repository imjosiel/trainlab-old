import { HttpException } from '@nestjs/common';

import { ProfileService } from './profile.service';

function prismaMock() {
  return {
    student: { findFirst: jest.fn() },
    athleteProfile: { findMany: jest.fn(), deleteMany: jest.fn(), update: jest.fn(), create: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function sessao(over: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    roles: ['INDIVIDUAL'],
    systemRoles: ['USER'],
    isAdmin: false,
    ...over,
  } as never;
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

/**
 * Fatia 32 (lote 1) — RED. Profile get/upsert.
 */
describe('ProfileService', () => {
  let prisma: PrismaMock;
  let service: ProfileService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ProfileService(prisma as any);
    prisma.athleteProfile.findMany.mockResolvedValue([]);
  });

  describe('get', () => {
    it('próprio perfil → devolve lista', async () => {
      prisma.athleteProfile.findMany.mockResolvedValue([{ id: 'p1' }]);
      const r = await service.get(sessao(), {});
      expect(r.profile).toMatchObject({ id: 'p1' });
    });

    it('terceiro sem vínculo, sem ser admin → 403', async () => {
      const body = await bodyOfRejection(service.get(sessao(), { userId: 'outro' }));
      expect(body).toEqual({ error: expect.stringMatching(/negado/i) });
    });

    it('[controle] admin lê perfil de terceiro', async () => {
      prisma.athleteProfile.findMany.mockResolvedValue([{ id: 'p1' }]);
      const r = await service.get(sessao({ isAdmin: true }), { userId: 'outro' });
      expect(r.profile).toMatchObject({ id: 'p1' });
    });

    it('treinador lê perfil do próprio aluno', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 's1' });
      prisma.athleteProfile.findMany.mockResolvedValue([{ id: 'p1' }]);
      const r = await service.get(sessao({ roles: ['PROFESSIONAL'] }), { userId: 'aluno-1' });
      expect(r.profile).toMatchObject({ id: 'p1' });
    });
  });

  describe('upsert', () => {
    it('sem esportes → 400', async () => {
      const body = await bodyOfRejection(service.upsert(sessao(), { sports: [] } as never));
      expect(body).toEqual({ error: expect.stringMatching(/esporte/i) });
    });

    it('6 esportes → 400', async () => {
      const body = await bodyOfRejection(
        service.upsert(sessao(), { sports: Array.from({ length: 6 }, () => ({ sportId: 's' })) } as never),
      );
      expect(body).toEqual({ error: expect.stringMatching(/máx/i) });
    });

    it('[controle] 1 esporte cria perfil', async () => {
      prisma.athleteProfile.create.mockResolvedValue({ id: 'novo' });
      const r = await service.upsert(sessao(), { sports: [{ sportId: 's1' }] } as never);
      expect(r.profiles).toHaveLength(1);
    });

    it('remove perfis de esportes não enviados', async () => {
      prisma.athleteProfile.findMany.mockResolvedValue([{ id: 'velho', sportId: 's-velho' }]);
      prisma.athleteProfile.create.mockResolvedValue({ id: 'novo' });
      await service.upsert(sessao(), { sports: [{ sportId: 's-novo' }] } as never);
      expect(prisma.athleteProfile.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['velho'] } } }),
      );
    });
  });
});
