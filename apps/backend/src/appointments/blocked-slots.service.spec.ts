import { BadRequestException, NotFoundException } from '@nestjs/common';

import { BlockedSlotsService } from './blocked-slots.service';

function prismaMock() {
  return {
    blockedSlot: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

function configMock() {
  return { get: jest.fn().mockResolvedValue({ config: { id: 'cfg-1' } }) };
}

const EU = 'trainer-1';
const SLOT = 'slot-1';

describe('BlockedSlotsService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let config: ReturnType<typeof configMock>;
  let service: BlockedSlotsService;

  beforeEach(() => {
    prisma = prismaMock();
    config = configMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new BlockedSlotsService(prisma as any, config as any);

    prisma.blockedSlot.findMany.mockResolvedValue([]);
    prisma.blockedSlot.create.mockResolvedValue({ id: SLOT });
    prisma.blockedSlot.deleteMany.mockResolvedValue({ count: 1 });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A64 — o filtro de data era descartado em silêncio
   * ────────────────────────────────────────────────────────────────────────── */

  describe('list — data inválida (corrige A64)', () => {
    it.each([['from'], ['to']])('%s inválido → 400', async (campo) => {
      await expect(service.list(EU, { [campo]: 'ontem' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    // CONTROLE. O legado, em vez de 400, OMITIA o filtro e devolvia tudo. Sem
    // este par, um serviço que rejeitasse qualquer data passaria nos dois acima.
    it('[controle] data válida vira filtro de verdade', async () => {
      await service.list(EU, { from: '2026-01-01T00:00:00.000Z' });

      const { where } = prisma.blockedSlot.findMany.mock.calls[0][0];
      expect(where.startTime).toEqual({ gte: new Date('2026-01-01T00:00:00.000Z') });
    });

    it('sem filtro, não manda startTime nenhum', async () => {
      await service.list(EU, {});
      const { where } = prisma.blockedSlot.findMany.mock.calls[0][0];
      expect(where.startTime).toBeUndefined();
    });

    it('escopa pela config do requisitante', async () => {
      await service.list(EU, {});
      const { where } = prisma.blockedSlot.findMany.mock.calls[0][0];
      expect(where.configId).toBe('cfg-1');
    });

    it('ordena por início', async () => {
      await service.list(EU, {});
      expect(prisma.blockedSlot.findMany.mock.calls[0][0].orderBy).toEqual({ startTime: 'asc' });
    });
  });

  describe('create', () => {
    const valido = { startTime: '2026-01-01T10:00:00.000Z', endTime: '2026-01-01T11:00:00.000Z' };

    it.each([
      ['sem startTime', { endTime: valido.endTime }],
      ['sem endTime', { startTime: valido.startTime }],
      ['startTime inválido', { ...valido, startTime: 'ontem' }],
      ['endTime inválido', { ...valido, endTime: 'amanhã' }],
    ])('%s → 400', async (_rotulo, body) => {
      await expect(service.create(EU, body)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.blockedSlot.create).not.toHaveBeenCalled();
    });

    it('fim antes do início → 400', async () => {
      await expect(
        service.create(EU, { startTime: valido.endTime, endTime: valido.startTime }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('fim igual ao início → 400', async () => {
      await expect(
        service.create(EU, { startTime: valido.startTime, endTime: valido.startTime }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('[controle] intervalo válido é criado na config do requisitante', async () => {
      await service.create(EU, { ...valido, label: 'Almoço' });

      expect(prisma.blockedSlot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            configId: 'cfg-1',
            label: 'Almoço',
            startTime: new Date(valido.startTime),
            endTime: new Date(valido.endTime),
            isRecurring: false,
          }),
        }),
      );
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A65 — o DELETE revelava existência
   * ────────────────────────────────────────────────────────────────────────── */

  describe('remove — posse como filtro da escrita (D17, corrige A65)', () => {
    it('apaga filtrando pela config do requisitante, não só pelo id', async () => {
      await service.remove(SLOT, EU);

      const { where } = prisma.blockedSlot.deleteMany.mock.calls[0][0];
      expect(where).toEqual(expect.objectContaining({ id: SLOT, configId: 'cfg-1' }));
    });

    // O legado devolvia 403 para bloqueio de outro profissional — o que confirma
    // que ele EXISTE. Aqui inexistente e alheio são a mesma resposta (D16).
    it('bloqueio de outro profissional → 404, igual a inexistente', async () => {
      prisma.blockedSlot.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(SLOT, EU)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('[controle] o próprio bloqueio é apagado e responde ok', async () => {
      await expect(service.remove(SLOT, EU)).resolves.toEqual({ ok: true });
    });
  });
});
