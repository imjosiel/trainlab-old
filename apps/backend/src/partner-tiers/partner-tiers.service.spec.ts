import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';

import { PartnerTiersService } from './partner-tiers.service';

function prismaMock() {
  const tx = {
    partnerTier: { updateMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  return {
    tx,
    partnerTier: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    partnerAccount: { count: jest.fn() },
    partnerTierRequest: { count: jest.fn() },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
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

const TIER = 'tier-1';
const VALIDO = { name: 'Pro', slug: 'pro', commissionRate: 0.5, price: 99.9, minPrice: 49.9 };

describe('PartnerTiersService', () => {
  let prisma: PrismaMock;
  let service: PartnerTiersService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new PartnerTiersService(prisma as any);

    prisma.partnerTier.findMany.mockResolvedValue([]);
    prisma.partnerTier.findFirst.mockResolvedValue(null);
    prisma.partnerTier.findUnique.mockResolvedValue({ id: TIER, slug: 'pro' });
    prisma.partnerTier.create.mockResolvedValue({ id: TIER });
    prisma.partnerTier.update.mockResolvedValue({ id: TIER });
    prisma.tx.partnerTier.create.mockResolvedValue({ id: TIER });
    prisma.tx.partnerTier.update.mockResolvedValue({ id: TIER });
    prisma.partnerAccount.count.mockResolvedValue(0);
    prisma.partnerTierRequest.count.mockResolvedValue(0);
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A68 — os cinco campos numéricos
   * ────────────────────────────────────────────────────────────────────────── */

  describe('criar — validação numérica (D71, corrige A68)', () => {
    // No legado, TRÊS destes tinham guarda e DOIS não — e os dois sem guarda
    // eram justamente `price` e `minPrice`.
    const CAMPOS_NUMERICOS = ['commissionRate', 'minPrice', 'price', 'payoutDelayDays', 'creditsPerPeriod'];
    const LIXO = ['', 'abc', [], {}, NaN, Infinity];

    describe.each(CAMPOS_NUMERICOS)('%s', (campo) => {
      it.each(LIXO.map((v) => [JSON.stringify(v) ?? String(v), v]))(
        'rejeita %s com 400, sem gravar',
        async (_rotulo, valor) => {
          await expect(
            service.criar({ ...VALIDO, [campo]: valor }),
          ).rejects.toBeInstanceOf(BadRequestException);
          expect(prisma.partnerTier.create).not.toHaveBeenCalled();
          expect(prisma.tx.partnerTier.create).not.toHaveBeenCalled();
        },
      );
    });

    /**
     * `null` sai da lista de lixo acima porque ele NÃO significa a mesma coisa
     * em todos os campos, e a primeira versão deste teste tratava como se
     * significasse.
     *
     * `creditsPerPeriod` é `Int?` no schema: `null` é o valor legítimo para
     * "sem crédito". Rejeitá-lo com 400 tiraria da tela de admin a única forma
     * de limpar o campo. Os outros quatro não são anuláveis, e aí `null` é lixo
     * como qualquer outro.
     */
    it.each([['commissionRate'], ['minPrice'], ['price'], ['payoutDelayDays']])(
      'null em %s → 400, porque o campo não é anulável',
      async (campo) => {
        await expect(service.criar({ ...VALIDO, [campo]: null })).rejects.toBeInstanceOf(
          BadRequestException,
        );
      },
    );

    it('null em creditsPerPeriod é aceito e grava null — é como se limpa o campo', async () => {
      await service.criar({ ...VALIDO, creditsPerPeriod: null });

      const { data } = prisma.partnerTier.create.mock.calls[0][0];
      expect(data.creditsPerPeriod).toBeNull();
    });

    // CONTROLE do bloco inteiro. Sem ele, um `criar` que rejeitasse tudo
    // passaria em cada caso acima.
    it('[controle] corpo válido é gravado', async () => {
      await service.criar(VALIDO);

      expect(prisma.partnerTier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'pro', commissionRate: 0.5, price: 99.9 }),
        }),
      );
    });

    it('commissionRate fora de 0..1 → 400', async () => {
      await expect(service.criar({ ...VALIDO, commissionRate: 1.5 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.criar({ ...VALIDO, commissionRate: -0.1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    // O legado validava commissionRate em 0..1 e aceitava price: -100.
    it.each([['price'], ['minPrice']])('%s negativo → 400', async (campo) => {
      await expect(service.criar({ ...VALIDO, [campo]: -1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('[controle] price e minPrice aceitam zero', async () => {
      await expect(service.criar({ ...VALIDO, price: 0, minPrice: 0 })).resolves.toBeDefined();
    });
  });

  describe('criar — identidade', () => {
    it.each([
      ['sem name', { ...VALIDO, name: undefined }],
      ['sem slug', { ...VALIDO, slug: undefined }],
      ['sem commissionRate', { ...VALIDO, commissionRate: undefined }],
      ['name acima de 50', { ...VALIDO, name: 'a'.repeat(51) }],
      ['slug com maiúscula e espaço', { ...VALIDO, slug: 'Pro Tier' }],
      ['slug com acento', { ...VALIDO, slug: 'pró' }],
    ])('%s → 400', async (_rotulo, body) => {
      await expect(service.criar(body)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('slug duplicado → 409', async () => {
      prisma.partnerTier.findFirst.mockResolvedValue({ id: 'outro' });
      await expect(service.criar(VALIDO)).rejects.toBeInstanceOf(ConflictException);
    });

    it('grava o slug em minúsculas', async () => {
      await service.criar({ ...VALIDO, slug: 'PRO' });
      const { data } = prisma.partnerTier.create.mock.calls[0][0];
      expect(data.slug).toBe('pro');
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A69 — isDefault
   * ────────────────────────────────────────────────────────────────────────── */

  describe('isDefault — caminho único e transacional (D72, corrige A69)', () => {
    it('criar como padrão desmarca os outros DENTRO da transação', async () => {
      await service.criar({ ...VALIDO, isDefault: true });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.tx.partnerTier.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isDefault: false } }),
      );
      expect(prisma.tx.partnerTier.create).toHaveBeenCalled();
      // O que o A69 mostra: no legado o PUT fazia isso FORA de transação.
      expect(prisma.partnerTier.updateMany).not.toHaveBeenCalled();
    });

    it('atualizar para padrão desmarca os outros DENTRO da transação', async () => {
      await service.atualizar(TIER, { isDefault: true });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.tx.partnerTier.updateMany).toHaveBeenCalled();
      expect(prisma.partnerTier.updateMany).not.toHaveBeenCalled();
    });

    it('ao desmarcar, o updateMany poupa o próprio tier', async () => {
      await service.atualizar(TIER, { isDefault: true });

      const { where } = prisma.tx.partnerTier.updateMany.mock.calls[0][0];
      expect(where).toEqual({ NOT: { id: TIER } });
    });

    // CONTROLE: sem isDefault, nada de transação nem de updateMany.
    it('[controle] criar sem isDefault não mexe nos outros', async () => {
      await service.criar(VALIDO);

      expect(prisma.tx.partnerTier.updateMany).not.toHaveBeenCalled();
      expect(prisma.partnerTier.updateMany).not.toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * A70 — o GET que escrevia
   * ────────────────────────────────────────────────────────────────────────── */

  describe('listagens (D73, corrige A70)', () => {
    it('listarTodos NÃO cria nada — listagem lista', async () => {
      await service.listarTodos();

      expect(prisma.partnerTier.create).toHaveBeenCalledTimes(0);
      expect(prisma.tx.partnerTier.create).toHaveBeenCalledTimes(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('listarAtivos filtra por isActive', async () => {
      await service.listarAtivos();
      const { where } = prisma.partnerTier.findMany.mock.calls[0][0];
      expect(where).toEqual({ isActive: true });
    });

    it('listarPublicos filtra por isActive', async () => {
      await service.listarPublicos();
      const { where } = prisma.partnerTier.findMany.mock.calls[0][0];
      expect(where).toEqual({ isActive: true });
    });

    // A71: a rota pública é tabela de preços, mas o recorte precisa ser
    // explícito — campo novo no modelo não pode aparecer sozinho na landing.
    it('listarPublicos usa select explícito, nunca o modelo inteiro', async () => {
      await service.listarPublicos();
      const args = prisma.partnerTier.findMany.mock.calls[0][0];

      expect(args.select).toBeDefined();
      expect(args.include).toBeUndefined();
      // Campos internos que não têm por que sair numa página pública.
      expect(args.select).not.toHaveProperty('payoutDelayDays');
      expect(args.select).not.toHaveProperty('payoutSchedule');
      expect(args.select).not.toHaveProperty('hourlyRatePolicy');
    });

    it('as duas listagens ordenam por preço', async () => {
      await service.listarAtivos();
      await service.listarPublicos();

      expect(prisma.partnerTier.findMany.mock.calls[0][0].orderBy).toEqual({ price: 'asc' });
      expect(prisma.partnerTier.findMany.mock.calls[1][0].orderBy).toEqual({ price: 'asc' });
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Remoção
   * ────────────────────────────────────────────────────────────────────────── */

  describe('remover', () => {
    it('com parceiro vinculado → 400 e nada apagado', async () => {
      prisma.partnerAccount.count.mockResolvedValue(3);

      const body = await bodyOfRejection(service.remover(TIER));

      expect(body).toEqual({ error: expect.stringMatching(/parceiro/i) });
      expect(prisma.partnerTier.delete).not.toHaveBeenCalled();
    });

    it('com histórico de trocas → 400 e nada apagado', async () => {
      prisma.partnerTierRequest.count.mockResolvedValue(2);

      await expect(service.remover(TIER)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.partnerTier.delete).not.toHaveBeenCalled();
    });

    it('o histórico conta os dois lados da troca', async () => {
      await service.remover(TIER);

      const { where } = prisma.partnerTierRequest.count.mock.calls[0][0];
      expect(where).toEqual({ OR: [{ toTierId: TIER }, { fromTierId: TIER }] });
    });

    it('[controle] sem vínculo nem histórico, apaga', async () => {
      await expect(service.remover(TIER)).resolves.toEqual({ ok: true });
      expect(prisma.partnerTier.delete).toHaveBeenCalledWith({ where: { id: TIER } });
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * D74 — contrato
   * ────────────────────────────────────────────────────────────────────────── */

  describe('contrato de resposta (D74, corrige A72)', () => {
    it('criar embrulha em { tier }', async () => {
      const r = await service.criar(VALIDO);
      expect(r).toEqual({ tier: expect.objectContaining({ id: TIER }) });
    });

    it('atualizar embrulha em { tier }', async () => {
      const r = await service.atualizar(TIER, { name: 'Novo' });
      expect(r).toEqual({ tier: expect.objectContaining({ id: TIER }) });
    });

    it('as listagens embrulham em { tiers }', async () => {
      expect(await service.listarTodos()).toEqual({ tiers: [] });
      expect(await service.listarAtivos()).toEqual({ tiers: [] });
      expect(await service.listarPublicos()).toEqual({ tiers: [] });
    });
  });
});
