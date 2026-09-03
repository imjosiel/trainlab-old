import { HttpException } from '@nestjs/common';

import { AdminUsersSearchService } from './admin-users-search.service';

function prismaMock() {
  return { user: { findUnique: jest.fn() } };
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
 * Fatia 33 (lote 2a) — RED. Busca de usuário por email.
 */
describe('AdminUsersSearchService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: AdminUsersSearchService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminUsersSearchService(prisma as any);
  });

  it('email vazio → 400', async () => {
    const body = await bodyOfRejection(service.buscar('   '));
    expect(body).toEqual({ error: 'Parâmetro email é obrigatório.' });
  });

  it('ausente → 400', async () => {
    const body = await bodyOfRejection(service.buscar(undefined));
    expect(body).toEqual({ error: 'Parâmetro email é obrigatório.' });
  });

  it('inexistente → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const body = await bodyOfRejection(service.buscar('a@b.com'));
    expect(body).toEqual({ error: 'Usuário não encontrado.' });
  });

  it('[controle] encontra com trim e traz créditos', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', credits: { planCredits: 5 } });
    const r = await service.buscar('  a@b.com  ');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'a@b.com' } }),
    );
    expect(r.user).toMatchObject({ id: 'u1' });
  });
});
