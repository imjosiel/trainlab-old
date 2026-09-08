import { HttpException } from '@nestjs/common';

import { AdminCreditsService } from './admin-credits.service';

function prismaMock() {
  return {
    creditPackage: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    creditTransaction: { findMany: jest.fn() },
  };
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

describe('AdminCreditsService', () => {
  let prisma: PrismaMock;
  let service: AdminCreditsService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminCreditsService(prisma as any);

    prisma.creditPackage.findMany.mockResolvedValue([]);
    prisma.creditPackage.create.mockResolvedValue({ id: 'pkg-novo' });
    prisma.creditPackage.update.mockResolvedValue({ id: 'pkg-1' });
    prisma.creditPackage.delete.mockResolvedValue({ id: 'pkg-1' });
    prisma.creditTransaction.findMany.mockResolvedValue([]);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * listarPacotes — GET /admin/credits/packages
   * ──────────────────────────────────────────────────────────────────────── */

  describe('listarPacotes', () => {
    it('lista TODOS os pacotes (não só ativos), ordenados por créditos', async () => {
      await service.listarPacotes();
      const chamada = prisma.creditPackage.findMany.mock.calls[0][0];
      expect(chamada).toEqual({ orderBy: { credits: 'asc' } });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * criarPacote — POST /admin/credits/packages
   * ──────────────────────────────────────────────────────────────────────── */

  describe('criarPacote', () => {
    const VALIDO = { name: 'Pacote Básico', credits: 100, price: 19.9 };

    it('sem nome → 400', async () => {
      // Corpo inválido de propósito (dupla barreira D104).
      const body = await bodyOfRejection(service.criarPacote({ ...VALIDO, name: undefined } as never));
      expect(body).toEqual({ error: 'name é obrigatório (máx. 100 chars).' });
    });

    it('nome maior que 100 caracteres → 400', async () => {
      const body = await bodyOfRejection(service.criarPacote({ ...VALIDO, name: 'a'.repeat(101) }));
      expect(body).toEqual({ error: 'name é obrigatório (máx. 100 chars).' });
    });

    it('credits fora da faixa (0) → 400', async () => {
      const body = await bodyOfRejection(service.criarPacote({ ...VALIDO, credits: 0 }));
      expect(body).toEqual({ error: 'credits deve ser entre 1 e 500.000.' });
    });

    it('credits acima de 500.000 → 400', async () => {
      const body = await bodyOfRejection(service.criarPacote({ ...VALIDO, credits: 500_001 }));
      expect(body).toEqual({ error: 'credits deve ser entre 1 e 500.000.' });
    });

    it('price fora da faixa (0) → 400', async () => {
      const body = await bodyOfRejection(service.criarPacote({ ...VALIDO, price: 0 }));
      expect(body).toEqual({ error: 'price deve ser entre R$0,01 e R$9.999,99.' });
    });

    it('price acima de 9999.99 → 400', async () => {
      const body = await bodyOfRejection(service.criarPacote({ ...VALIDO, price: 10_000 }));
      expect(body).toEqual({ error: 'price deve ser entre R$0,01 e R$9.999,99.' });
    });

    it('cria o pacote com os dados validados', async () => {
      await service.criarPacote(VALIDO);
      expect(prisma.creditPackage.create).toHaveBeenCalledWith({
        data: { name: 'Pacote Básico', credits: 100, price: 19.9, stripePriceId: null },
      });
    });

    it('[controle] pacote válido no limite superior não é rejeitado', async () => {
      await expect(service.criarPacote({ name: 'X', credits: 500_000, price: 9999.99 })).resolves.toBeDefined();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * atualizarPacote — PATCH /admin/credits/packages/:id
   * ──────────────────────────────────────────────────────────────────────── */

  describe('atualizarPacote', () => {
    it('atualiza só os campos enviados', async () => {
      await service.atualizarPacote('pkg-1', { isActive: false });
      expect(prisma.creditPackage.update).toHaveBeenCalledWith({
        where: { id: 'pkg-1' },
        data: { isActive: false },
      });
    });

    it('valida credits quando enviado', async () => {
      const body = await bodyOfRejection(service.atualizarPacote('pkg-1', { credits: -5 }));
      expect(body).toEqual({ error: 'credits deve ser entre 1 e 500.000.' });
      expect(prisma.creditPackage.update).not.toHaveBeenCalled();
    });

    it('valida price quando enviado', async () => {
      const body = await bodyOfRejection(service.atualizarPacote('pkg-1', { price: -1 }));
      expect(body).toEqual({ error: 'price deve ser entre R$0,01 e R$9.999,99.' });
    });

    it('[controle] sem credits/price no body, não valida nada relacionado a eles', async () => {
      await service.atualizarPacote('pkg-1', { name: 'Novo nome' });
      expect(prisma.creditPackage.update).toHaveBeenCalledWith({
        where: { id: 'pkg-1' },
        data: { name: 'Novo nome' },
      });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * apagarPacote — DELETE /admin/credits/packages/:id
   * ──────────────────────────────────────────────────────────────────────── */

  describe('apagarPacote', () => {
    it('apaga o pacote', async () => {
      const r = await service.apagarPacote('pkg-1');
      expect(prisma.creditPackage.delete).toHaveBeenCalledWith({ where: { id: 'pkg-1' } });
      expect(r).toEqual({ success: true });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * listarTransacoes — GET /admin/credits/transactions
   * ──────────────────────────────────────────────────────────────────────── */

  describe('listarTransacoes', () => {
    it('busca as últimas 50, de todos os usuários, com nome e email', async () => {
      await service.listarTransacoes();
      expect(prisma.creditTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: expect.objectContaining({ user: { select: { name: true, email: true } } }),
        }),
      );
    });
  });
});
