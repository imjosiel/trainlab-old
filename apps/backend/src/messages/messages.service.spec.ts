import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';

import { MessagesService } from './messages.service';

/* ────────────────────────────────────────────────────────────────────────────
 * Mocks
 * ──────────────────────────────────────────────────────────────────────────── */

function prismaMock() {
  const tx = {
    message: { create: jest.fn() },
    conversation: { update: jest.fn() },
  };

  return {
    tx,
    conversation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    // Forma de callback, decidida aqui: o legado usa `$transaction([...])`, que
    // devolve um array e obriga a desestruturar por posição. Com callback o
    // serviço devolve a mensagem já montada.
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function realtimeMock() {
  return { emitirNovaMensagem: jest.fn().mockResolvedValue(undefined) };
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

/* ────────────────────────────────────────────────────────────────────────────
 * Interpretador de filtro — o que torna o teste do A50 não-vacuoso
 *
 * Afirmar o FORMATO do `where` (`expect.objectContaining({ OR: [...] })`) prova
 * que o objeto tem certa cara, não que ele ALCANÇA a conversa que hoje some.
 * Este avaliador roda o filtro contra linhas de verdade, e o teste primeiro
 * demonstra que ele **reprova** a regra legada. Sem esse controle, um filtro
 * furado passaria igual — foi assim que os A39, A40, A45 e A46 nasceram.
 * ──────────────────────────────────────────────────────────────────────────── */

interface Conversa {
  id: string;
  trainerId: string;
  studentId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtroAlcanca(where: any, conv: Conversa): boolean {
  if (!where) return true;
  if (Array.isArray(where.OR)) {
    return where.OR.some((cond: unknown) => filtroAlcanca(cond, conv));
  }
  return Object.entries(where).every(([campo, valor]) => {
    if (campo === 'OR') return true;
    return (conv as unknown as Record<string, unknown>)[campo] === valor;
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Cenário
 * ──────────────────────────────────────────────────────────────────────────── */

const EU = 'user-duplo'; // tem ['PROFESSIONAL', 'CLIENT'] — estado provado alcançável (A50)
const OUTRO = 'user-outro';
const TERCEIRO = 'user-terceiro';
const CONV = 'conv-1';

/** Conversa em que EU sou o profissional. O legado enxerga. */
const COMO_PROFISSIONAL: Conversa = { id: 'c-prof', trainerId: EU, studentId: OUTRO };

/** Conversa em que EU sou o cliente. O legado NÃO enxerga — é o A50. */
const COMO_CLIENTE: Conversa = { id: 'c-cli', trainerId: OUTRO, studentId: EU };

/** A regra do legado, escrita aqui para servir de controle do teste. */
const FILTRO_LEGADO_QUANDO_PROFISSIONAL = { trainerId: EU };

describe('MessagesService', () => {
  let prisma: PrismaMock;
  let realtime: ReturnType<typeof realtimeMock>;
  let service: MessagesService;

  beforeEach(() => {
    prisma = prismaMock();
    realtime = realtimeMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new MessagesService(prisma as any, realtime as any);

    prisma.conversation.findMany.mockResolvedValue([]);
    prisma.message.groupBy.mockResolvedValue([]);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.conversation.findFirst.mockResolvedValue({ id: CONV, trainerId: EU, studentId: OUTRO });
    prisma.message.updateMany.mockResolvedValue({ count: 0 });
    prisma.user.count.mockResolvedValue(1);
    prisma.tx.message.create.mockResolvedValue({ id: 'm-1', content: 'oi' });
    prisma.tx.conversation.update.mockResolvedValue({});
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D60 — participação, não papel
   * ────────────────────────────────────────────────────────────────────────── */

  describe('listConversations — filtro por participação (D60, corrige A50)', () => {
    // CONTROLE. Se esta falhar, o avaliador não discrimina e todo o resto deste
    // bloco é vacuoso.
    it('[controle] a regra legada por papel NÃO alcança a conversa em que sou cliente', () => {
      expect(filtroAlcanca(FILTRO_LEGADO_QUANDO_PROFISSIONAL, COMO_PROFISSIONAL)).toBe(true);
      expect(filtroAlcanca(FILTRO_LEGADO_QUANDO_PROFISSIONAL, COMO_CLIENTE)).toBe(false);
    });

    it('o filtro alcança a conversa em que sou o profissional', async () => {
      await service.listConversations(EU, {});

      const { where } = prisma.conversation.findMany.mock.calls[0][0];
      expect(filtroAlcanca(where, COMO_PROFISSIONAL)).toBe(true);
    });

    it('o filtro alcança a conversa em que sou o cliente', async () => {
      await service.listConversations(EU, {});

      const { where } = prisma.conversation.findMany.mock.calls[0][0];
      expect(filtroAlcanca(where, COMO_CLIENTE)).toBe(true);
    });

    it('o filtro NÃO alcança conversa entre dois terceiros', async () => {
      await service.listConversations(EU, {});

      const { where } = prisma.conversation.findMany.mock.calls[0][0];
      expect(
        filtroAlcanca(where, { id: 'c-x', trainerId: OUTRO, studentId: TERCEIRO }),
      ).toBe(false);
    });

    it('o papel do requisitante não entra na consulta', async () => {
      await service.listConversations(EU, {});

      const chamada = JSON.stringify(prisma.conversation.findMany.mock.calls[0][0]);
      expect(chamada).not.toMatch(/PROFESSIONAL|CLIENT|INDIVIDUAL|roles/);
    });

    it('conta como não lidas só as que a outra pessoa mandou', async () => {
      prisma.conversation.findMany.mockResolvedValue([{ ...COMO_CLIENTE, messages: [] }]);

      await service.listConversations(EU, {});

      expect(prisma.message.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ senderId: { not: EU }, readAt: null }),
        }),
      );
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D61 — ordenação total
   * ────────────────────────────────────────────────────────────────────────── */

  describe('listConversations — paginação (D61, corrige A51)', () => {
    it('ordena por lastMessageAt e desempata por id', async () => {
      await service.listConversations(EU, {});

      const { orderBy } = prisma.conversation.findMany.mock.calls[0][0];
      expect(orderBy).toEqual([{ lastMessageAt: 'desc' }, { id: 'desc' }]);
    });

    it('sem cursor, não manda cursor nem skip', async () => {
      await service.listConversations(EU, {});

      const args = prisma.conversation.findMany.mock.calls[0][0];
      expect(args.cursor).toBeUndefined();
      expect(args.skip).toBeUndefined();
    });

    it('com cursor, pula a própria linha do cursor', async () => {
      await service.listConversations(EU, { cursor: 'c-50' });

      const args = prisma.conversation.findMany.mock.calls[0][0];
      expect(args.cursor).toEqual({ id: 'c-50' });
      expect(args.skip).toBe(1);
    });

    it('nextCursor é null quando a página não encheu', async () => {
      prisma.conversation.findMany.mockResolvedValue([{ ...COMO_CLIENTE, messages: [] }]);

      const r = await service.listConversations(EU, {});

      expect(r.nextCursor).toBeNull();
    });

    it('nextCursor é o id da última quando a página encheu', async () => {
      const cheia = Array.from({ length: 50 }, (_, i) => ({
        id: `c-${i}`,
        trainerId: EU,
        studentId: OUTRO,
        messages: [],
      }));
      prisma.conversation.findMany.mockResolvedValue(cheia);

      const r = await service.listConversations(EU, {});

      expect(r.nextCursor).toBe('c-49');
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D63 — o pouco que entra do A52
   * ────────────────────────────────────────────────────────────────────────── */

  describe('createConversation (D63)', () => {
    it('exige os dois ids', async () => {
      const body = await bodyOfRejection(service.createConversation(EU, { trainerId: EU }));
      expect(body).toEqual({ error: expect.stringMatching(/obrigat/i) });
    });

    it('rejeita quem não é participante', async () => {
      await expect(
        service.createConversation(TERCEIRO, { trainerId: EU, studentId: OUTRO }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('rejeita conversa de alguém consigo mesmo', async () => {
      await expect(
        service.createConversation(EU, { trainerId: EU, studentId: EU }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 quando o outro participante não existe — não 500 por FK', async () => {
      prisma.user.count.mockResolvedValue(0);

      await expect(
        service.createConversation(EU, { trainerId: EU, studentId: 'fantasma' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.conversation.upsert).not.toHaveBeenCalled();
    });

    it('recupera a existente em vez de duplicar', async () => {
      prisma.conversation.upsert.mockResolvedValue({ id: CONV });

      await service.createConversation(EU, { trainerId: EU, studentId: OUTRO });

      expect(prisma.conversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { trainerId_studentId: { trainerId: EU, studentId: OUTRO } },
          update: {},
        }),
      );
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Posse nas rotas por id
   * ────────────────────────────────────────────────────────────────────────── */

  describe('posse da conversa', () => {
    it('listMessages devolve 404 para conversa que não é minha', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.listMessages(CONV, TERCEIRO, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('sendMessage devolve 404 para conversa que não é minha, sem gravar', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(CONV, TERCEIRO, { content: 'oi' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tx.message.create).not.toHaveBeenCalled();
    });

    it('markRead devolve 404 para conversa que não é minha, sem marcar', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.markRead(CONV, TERCEIRO)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it('a checagem de posse usa participação nos dois lados', async () => {
      await service.listMessages(CONV, EU, {});

      const { where } = prisma.conversation.findFirst.mock.calls[0][0];
      expect(filtroAlcanca(where, COMO_PROFISSIONAL)).toBe(true);
      expect(filtroAlcanca(where, COMO_CLIENTE)).toBe(true);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Envio
   * ────────────────────────────────────────────────────────────────────────── */

  describe('sendMessage — validação de conteúdo', () => {
    it.each([
      ['vazio', ''],
      ['só espaço', '   '],
      ['só quebra de linha', '\n\n'],
      ['ausente', undefined],
    ])('rejeita conteúdo %s', async (_rotulo, content) => {
      await expect(service.sendMessage(CONV, EU, { content })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejeita acima de 5.000 caracteres', async () => {
      await expect(
        service.sendMessage(CONV, EU, { content: 'a'.repeat(5001) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // A54: o legado mede antes do trim e rejeita isto, mesmo cabendo.
    it('aceita 5.000 caracteres com espaço em volta — o limite mede o que será gravado', async () => {
      const conteudo = `  ${'a'.repeat(5000)}  `;

      await expect(service.sendMessage(CONV, EU, { content: conteudo })).resolves.toBeDefined();
    });

    it('grava o conteúdo já sem espaço nas pontas', async () => {
      await service.sendMessage(CONV, EU, { content: '  oi  ' });

      expect(prisma.tx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'oi', senderId: EU, conversationId: CONV }),
        }),
      );
    });

    it('atualiza lastMessageAt na mesma transação', async () => {
      await service.sendMessage(CONV, EU, { content: 'oi' });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.tx.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CONV } }),
      );
    });
  });

  describe('sendMessage — tempo real (D62, corrige A53)', () => {
    it('emite o evento da conversa depois de gravar', async () => {
      await service.sendMessage(CONV, EU, { content: 'oi' });

      expect(realtime.emitirNovaMensagem).toHaveBeenCalledWith(
        CONV,
        expect.objectContaining({ id: 'm-1' }),
      );
    });

    // A propriedade central do D62. Falha de ENTREGA não pode virar erro de
    // ESCRITA: a mensagem já está gravada, e um 500 aqui faz o cliente reenviar
    // — duplicando a mensagem.
    it('falha do tempo real não derruba o envio', async () => {
      realtime.emitirNovaMensagem.mockRejectedValue(new Error('pusher fora do ar'));

      const r = await service.sendMessage(CONV, EU, { content: 'oi' });

      expect(r.message).toEqual(expect.objectContaining({ id: 'm-1' }));
    });

    it('a mensagem continua gravada quando o tempo real falha', async () => {
      realtime.emitirNovaMensagem.mockRejectedValue(new Error('pusher fora do ar'));

      await service.sendMessage(CONV, EU, { content: 'oi' });

      expect(prisma.tx.message.create).toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Leitura
   * ────────────────────────────────────────────────────────────────────────── */

  describe('markRead', () => {
    it('marca só as mensagens que a outra pessoa mandou, e só as não lidas', async () => {
      await service.markRead(CONV, EU);

      expect(prisma.message.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: CONV, senderId: { not: EU }, readAt: null },
        }),
      );
    });

    it('responde ok', async () => {
      await expect(service.markRead(CONV, EU)).resolves.toEqual({ ok: true });
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Listagem de mensagens
   * ────────────────────────────────────────────────────────────────────────── */

  describe('listMessages — paginação', () => {
    it('devolve as mais antigas primeiro', async () => {
      prisma.message.findMany.mockResolvedValue([
        { id: 'm-3' },
        { id: 'm-2' },
        { id: 'm-1' },
      ]);

      const r = await service.listMessages(CONV, EU, {});

      expect(r.messages.map((m: { id: string }) => m.id)).toEqual(['m-1', 'm-2', 'm-3']);
    });

    it('busca em ordem decrescente de id, que é o campo do cursor', async () => {
      await service.listMessages(CONV, EU, {});

      const args = prisma.message.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ id: 'desc' });
    });

    it('o parâmetro before recorta por id', async () => {
      await service.listMessages(CONV, EU, { before: 'm-9' });

      const { where } = prisma.message.findMany.mock.calls[0][0];
      expect(where).toEqual(expect.objectContaining({ id: { lt: 'm-9' } }));
    });
  });
});
