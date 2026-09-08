import { WebhookClaimService } from './webhook-claim.service';

/** Erro do Prisma para violação de unicidade. */
function p2002() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

function prismaMock() {
  return {
    processedWebhookEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

const EVENTO = 'evt_1';

describe('WebhookClaimService (D75, corrige A74)', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: WebhookClaimService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new WebhookClaimService(prisma as any);

    prisma.processedWebhookEvent.create.mockResolvedValue({ eventId: EVENTO });
    prisma.processedWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.processedWebhookEvent.update.mockResolvedValue({ eventId: EVENTO });
    prisma.processedWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    prisma.processedWebhookEvent.delete.mockResolvedValue({ eventId: EVENTO });
  });

  describe('reivindicar', () => {
    it('grava o marcador ANTES de qualquer trabalho — é o que o A74 não fazia', async () => {
      const r = await service.reivindicar(EVENTO);

      expect(r).toBe('reivindicado');
      expect(prisma.processedWebhookEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventId: EVENTO }) }),
      );
    });

    // A propriedade central: a chave primária é TRAVA, não detector tardio.
    it('P2002 significa que outro processador já reivindicou', async () => {
      prisma.processedWebhookEvent.create.mockRejectedValue(p2002());
      prisma.processedWebhookEvent.findUnique.mockResolvedValue({
        eventId: EVENTO,
        status: 'processando',
        claimedAt: new Date(),
      });

      const r = await service.reivindicar(EVENTO);

      expect(r).toBe('em_andamento');
    });

    it('evento já concluído responde ja_processado', async () => {
      prisma.processedWebhookEvent.create.mockRejectedValue(p2002());
      prisma.processedWebhookEvent.findUnique.mockResolvedValue({
        eventId: EVENTO,
        status: 'concluido',
        claimedAt: new Date('2020-01-01'),
      });

      const r = await service.reivindicar(EVENTO);

      expect(r).toBe('ja_processado');
    });

    // Sem isto, um processo morto entre o claim e o handler tranca o evento para
    // sempre — e o Stripe desiste depois de algumas tentativas.
    it('claim velho e não concluído pode ser reivindicado de novo', async () => {
      prisma.processedWebhookEvent.create.mockRejectedValue(p2002());
      prisma.processedWebhookEvent.findUnique.mockResolvedValue({
        eventId: EVENTO,
        status: 'processando',
        claimedAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const r = await service.reivindicar(EVENTO);

      expect(r).toBe('reivindicado');
    });

    it('a retomada do claim velho é uma escrita condicional, não um create', async () => {
      prisma.processedWebhookEvent.create.mockRejectedValue(p2002());
      prisma.processedWebhookEvent.findUnique.mockResolvedValue({
        eventId: EVENTO,
        status: 'processando',
        claimedAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      await service.reivindicar(EVENTO);

      // `updateMany` filtrando pelo claim antigo: dois processos tentando
      // retomar o mesmo evento morto, só um consegue.
      expect(prisma.processedWebhookEvent.updateMany).toHaveBeenCalled();
      const { where } = prisma.processedWebhookEvent.updateMany.mock.calls[0][0];
      expect(where).toEqual(expect.objectContaining({ eventId: EVENTO }));
    });

    it('perder a corrida pela retomada devolve em_andamento', async () => {
      prisma.processedWebhookEvent.create.mockRejectedValue(p2002());
      prisma.processedWebhookEvent.findUnique.mockResolvedValue({
        eventId: EVENTO,
        status: 'processando',
        claimedAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      prisma.processedWebhookEvent.updateMany.mockResolvedValue({ count: 0 });

      const r = await service.reivindicar(EVENTO);

      expect(r).toBe('em_andamento');
    });

    it('erro que NÃO é P2002 sobe — não vira "já processado" por engano', async () => {
      prisma.processedWebhookEvent.create.mockRejectedValue(new Error('conexão caiu'));

      await expect(service.reivindicar(EVENTO)).rejects.toThrow('conexão caiu');
    });
  });

  describe('concluir e liberar', () => {
    it('concluir marca o evento como terminado', async () => {
      await service.concluir(EVENTO);

      expect(prisma.processedWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: EVENTO },
          data: expect.objectContaining({ status: 'concluido' }),
        }),
      );
    });

    // O par que impede o claim de virar tranca permanente.
    it('liberar apaga o claim para o Stripe reentregar', async () => {
      await service.liberar(EVENTO);

      expect(prisma.processedWebhookEvent.delete).toHaveBeenCalledWith({
        where: { eventId: EVENTO },
      });
    });

    it('liberar não explode se o registro já sumiu', async () => {
      prisma.processedWebhookEvent.delete.mockRejectedValue(
        Object.assign(new Error('not found'), { code: 'P2025' }),
      );

      await expect(service.liberar(EVENTO)).resolves.toBeUndefined();
    });
  });

  /**
   * O teste que descreve o A74 inteiro, em sequência.
   *
   * Sem o claim-first, os dois processadores passariam pela checagem e o
   * handler rodaria duas vezes. Aqui o segundo é barrado ANTES de trabalhar.
   */
  describe('a corrida do A74', () => {
    it('duas entregas simultâneas: só uma reivindica', async () => {
      const claims: string[] = [];
      prisma.processedWebhookEvent.create.mockImplementation(async () => {
        if (claims.includes(EVENTO)) throw p2002();
        claims.push(EVENTO);
        return { eventId: EVENTO };
      });
      prisma.processedWebhookEvent.findUnique.mockResolvedValue({
        eventId: EVENTO,
        status: 'processando',
        claimedAt: new Date(),
      });

      const [a, b] = await Promise.all([
        service.reivindicar(EVENTO),
        service.reivindicar(EVENTO),
      ]);

      expect([a, b].filter((r) => r === 'reivindicado')).toHaveLength(1);
      expect([a, b].filter((r) => r === 'em_andamento')).toHaveLength(1);
    });
  });
});
