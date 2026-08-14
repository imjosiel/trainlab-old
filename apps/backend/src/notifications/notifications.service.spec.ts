import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';

import { NotificationsService } from './notifications.service';

function prismaMock() {
  return {
    notification: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };
}

function realtimeMock() {
  return {
    emitirNovaNotificacao: jest.fn().mockResolvedValue(undefined),
    emitirNovaMensagem: jest.fn().mockResolvedValue(undefined),
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

const ME = 'user-a';
const OUTRO = 'user-b';

describe('NotificationsService', () => {
  let prisma: PrismaMock;
  let realtime: ReturnType<typeof realtimeMock>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = prismaMock();
    realtime = realtimeMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // RealtimeService entrou na fatia 13 (D70): criar notificação passou a
    // emitir o push explicitamente, no lugar do `$extends` implícito do web.
    service = new NotificationsService(prisma as any, realtime as any);
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
  });

  describe('list — posse (propriedades 3 e 4)', () => {
    it('escopa a busca ao userId do requisitante', async () => {
      await service.list(ME, {});

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: ME } }),
      );
    });

    it('conta como não lidas só as do requisitante', async () => {
      await service.list(ME, {});

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: ME, isRead: false },
      });
    });
  });

  describe('list — paginação (propriedades 9–15)', () => {
    // Propriedade 11
    it('ordena por createdAt desc', async () => {
      await service.list(ME, {});
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    // Propriedade 9
    it.each([
      ['padrão sem limit', undefined, 20],
      ['limit acima do teto', '999', 50],
      ['limit zero cai no piso', '0', 1],
      ['limit negativo cai no piso', '-5', 1],
      ['limit válido é respeitado', '7', 7],
    ])('%s → take %s', async (_label, limit, esperado) => {
      await service.list(ME, { limit });
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: esperado }),
      );
    });

    // Propriedade 10
    it('limit não-numérico cai no padrão', async () => {
      await service.list(ME, { limit: 'abc' });
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });

    // Propriedade 12 — preserva o BUG-65: cursor pelo MESMO campo do orderBy.
    it('cursor filtra por createdAt lt, não por id', async () => {
      const iso = '2026-08-01T10:00:00.000Z';
      await service.list(ME, { cursor: iso });

      const arg = prisma.notification.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: ME, createdAt: { lt: new Date(iso) } });
      expect(JSON.stringify(arg)).not.toContain('"id"');
    });

    it('sem cursor não adiciona filtro de data', async () => {
      await service.list(ME, {});
      expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({ userId: ME });
    });

    // Propriedade 15 — preserva o BUG-108: 400, não 500 do Prisma.
    it.each([['texto', 'ontem'], ['vazio-ish', 'not-a-date'], ['número solto', 'NaN']])(
      'cursor inválido (%s) → 400 sem tocar o banco',
      async (_label, cursor) => {
        await expect(service.list(ME, { cursor })).rejects.toThrow(BadRequestException);
        expect(prisma.notification.findMany).not.toHaveBeenCalled();
      },
    );

    it('a mensagem do cursor inválido aponta o formato esperado', async () => {
      const body = await bodyOfRejection(service.list(ME, { cursor: 'ontem' }));
      expect(body.error).toMatch(/ISO 8601/);
    });

    // Propriedade 13
    it('nextCursor é o createdAt da última linha quando a página encheu', async () => {
      const ultima = new Date('2026-07-01T08:00:00.000Z');
      prisma.notification.findMany.mockResolvedValue([
        { id: '1', createdAt: new Date('2026-07-02T08:00:00.000Z') },
        { id: '2', createdAt: ultima },
      ]);

      const res = await service.list(ME, { limit: '2' });
      expect(res.nextCursor).toBe(ultima.toISOString());
    });

    // Propriedade 14
    it('nextCursor é null quando a página veio incompleta', async () => {
      prisma.notification.findMany.mockResolvedValue([
        { id: '1', createdAt: new Date('2026-07-02T08:00:00.000Z') },
      ]);

      const res = await service.list(ME, { limit: '2' });
      expect(res.nextCursor).toBeNull();
    });

    it('nextCursor é null em página vazia', async () => {
      const res = await service.list(ME, {});
      expect(res.nextCursor).toBeNull();
    });

    it('devolve notifications e unreadCount no formato do legado', async () => {
      prisma.notification.count.mockResolvedValue(3);
      const res = await service.list(ME, {});
      expect(res).toEqual({ notifications: [], unreadCount: 3, nextCursor: null });
    });
  });

  describe('markAsRead — posse (propriedades 5–8)', () => {
    // Propriedade 7
    it('marca a própria notificação como lida', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      prisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: ME, isRead: true });

      const res = await service.markAsRead('n1', ME);
      expect(res).toEqual({ id: 'n1', userId: ME, isRead: true });
    });

    /**
     * Propriedade 5 + D17 — o coração da fatia. A posse é FILTRO, não `if`:
     * o `where` do updateMany carrega o userId, então esquecê-lo não devolve
     * dado alheio, quebra este teste.
     */
    it('a posse vai no where do updateMany, junto do id', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      prisma.notification.findUnique.mockResolvedValue({ id: 'n1' });

      await service.markAsRead('n1', ME);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n1', userId: ME },
        data: { isRead: true },
      });
    });

    it('notificação de outro usuário → 404 e nada é lido depois', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.markAsRead('n-do-outro', ME)).rejects.toThrow(NotFoundException);
      expect(prisma.notification.findUnique).not.toHaveBeenCalled();
    });

    // Propriedade 6 — não distinguir os dois casos É a propriedade.
    it('id inexistente e id de outro devolvem a MESMA resposta', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const inexistente = await bodyOfRejection(service.markAsRead('nao-existe', ME));
      const doOutro = await bodyOfRejection(service.markAsRead('n-do-outro', ME));

      expect(inexistente).toEqual(doOutro);
      expect(inexistente.error).toBe('Notificação não encontrada');
    });

    it('não usa o id de outro usuário como escopo em nenhuma consulta', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      await bodyOfRejection(service.markAsRead('n1', OUTRO));

      const where = prisma.notification.updateMany.mock.calls[0][0].where;
      expect(where.userId).toBe(OUTRO);
    });

    // Propriedade 8
    it('é idempotente: marcar já lida continua 200', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      prisma.notification.findUnique.mockResolvedValue({ id: 'n1', isRead: true });

      await expect(service.markAsRead('n1', ME)).resolves.toMatchObject({ isRead: true });
    });
  });
});
