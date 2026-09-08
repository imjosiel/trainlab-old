import { BadRequestException } from '@nestjs/common';

import { ScheduleConfigService } from './schedule-config.service';

function prismaMock() {
  return {
    trainerScheduleConfig: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
}

const EU = 'trainer-1';
const CONFIG_PADRAO = {
  id: 'cfg-1',
  trainerId: EU,
  workStartHour: 7,
  workEndHour: 22,
  workDays: [1, 2, 3, 4, 5],
  blockedSlots: [],
};

describe('ScheduleConfigService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: ScheduleConfigService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ScheduleConfigService(prisma as any);
    prisma.trainerScheduleConfig.upsert.mockResolvedValue(CONFIG_PADRAO);
    prisma.trainerScheduleConfig.update.mockResolvedValue(CONFIG_PADRAO);
  });

  describe('get', () => {
    it('cria com o padrão do legado quando ainda não existe', async () => {
      await service.get(EU);

      expect(prisma.trainerScheduleConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { trainerId: EU },
          update: {},
          create: expect.objectContaining({
            trainerId: EU,
            workStartHour: 7,
            workEndHour: 22,
            workDays: [1, 2, 3, 4, 5],
          }),
        }),
      );
    });

    it('traz os bloqueios ordenados por início', async () => {
      await service.get(EU);
      const args = prisma.trainerScheduleConfig.upsert.mock.calls[0][0];
      expect(args.include).toEqual({ blockedSlots: { orderBy: { startTime: 'asc' } } });
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D65 — o A58 medido ao vivo
   * ────────────────────────────────────────────────────────────────────────── */

  describe('update — validação de tipo, não só de faixa (corrige A58)', () => {
    it.each([
      ['workStartHour', ''],
      ['workStartHour', 'abc'],
      ['workStartHour', '10'],
      ['workStartHour', []],
      ['workStartHour', {}],
      ['workStartHour', 10.5],
      ['workEndHour', ''],
      ['workEndHour', 'abc'],
      ['workEndHour', '22'],
      ['workEndHour', []],
    ])('%s = %p → 400, e nada é gravado', async (campo, valor) => {
      await expect(service.update(EU, { [campo]: valor })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.trainerScheduleConfig.update).not.toHaveBeenCalled();
    });

    it.each([
      ['workStartHour', -1],
      ['workStartHour', 24],
      ['workEndHour', 99],
    ])('%s = %p fora da faixa → 400', async (campo, valor) => {
      await expect(service.update(EU, { [campo]: valor })).rejects.toBeInstanceOf(BadRequestException);
    });

    // CONTROLE. Sem estes, um `update` que rejeitasse tudo passaria em cada caso
    // acima — foi exatamente esse tipo de vacuidade que o A55 mostrou.
    it('[controle] valores inteiros válidos são aceitos e gravados', async () => {
      await service.update(EU, { workStartHour: 8, workEndHour: 18 });

      expect(prisma.trainerScheduleConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { trainerId: EU },
          data: expect.objectContaining({ workStartHour: 8, workEndHour: 18 }),
        }),
      );
    });

    it('[controle] corpo vazio não quebra e não muda nada', async () => {
      await expect(service.update(EU, {})).resolves.toBeDefined();
    });
  });

  describe('update — workDays (o campo que o legado já validava certo)', () => {
    it.each([
      ['não-array', 'segunda'],
      ['com string', ['1']],
      ['com fracionário', [1.5]],
      ['fora da faixa', [7]],
      ['negativo', [-1]],
    ])('%s → 400', async (_rotulo, valor) => {
      await expect(service.update(EU, { workDays: valor })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('[controle] array de inteiros 0–6 é aceito', async () => {
      await service.update(EU, { workDays: [0, 3, 6] });
      expect(prisma.trainerScheduleConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ workDays: [0, 3, 6] }) }),
      );
    });

    it('array vazio é aceito — profissional sem dia de expediente é escolha, não erro', async () => {
      await expect(service.update(EU, { workDays: [] })).resolves.toBeDefined();
    });
  });

  describe('update — a config é sempre a do requisitante', () => {
    it('grava na própria linha, sem aceitar trainerId do corpo', async () => {
      await service.update(EU, { workStartHour: 9, trainerId: 'outro' } as never);

      const { where, data } = prisma.trainerScheduleConfig.update.mock.calls[0][0];
      expect(where).toEqual({ trainerId: EU });
      expect(data).not.toHaveProperty('trainerId');
    });
  });
});
