import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';

import { DEFAULT_SPORTS } from './default-sports';
import { SportsService } from './sports.service';

/**
 * Lê o corpo real da exception.
 *
 * `toThrow(/regex/)` casa contra `err.message`, que é genérico ("Bad Request
 * Exception") quando a exception recebe um OBJETO — e receber objeto é o que o
 * D5 exige, para o corpo sair como `{ error }`. Asserção em `message` passaria
 * sem verificar nada do conteúdo.
 */
async function bodyOfRejection(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
    throw new Error('esperava rejeição, mas resolveu');
  } catch (err) {
    if (!(err instanceof HttpException)) throw err;
    return err.getResponse() as Record<string, unknown>;
  }
}

/** Mock do Prisma com só o que o service toca. */
function prismaMock() {
  return {
    sport: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
    },
    athleteProfile: {
      count: jest.fn(),
    },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

describe('SportsService', () => {
  let prisma: PrismaMock;
  let service: SportsService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new SportsService(prisma as any);
  });

  describe('listActive — GET público', () => {
    // Propriedades 2 e 3
    it('filtra por isActive, ordena por nome e limita a 50', async () => {
      prisma.sport.findMany.mockResolvedValue([]);
      await service.listActive();

      expect(prisma.sport.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        take: 50,
      });
    });

    // Propriedade 4
    it('substitui positions vazio pela lista de DEFAULT_SPORTS do mesmo slug', async () => {
      prisma.sport.findMany.mockResolvedValue([
        { id: '1', slug: 'soccer', name: 'Futebol', isActive: true, positions: [] },
      ]);

      const { sports } = await service.listActive();
      expect(sports[0].positions).toEqual([
        'Goleiro',
        'Zagueiro',
        'Lateral Direito',
        'Lateral Esquerdo',
        'Volante',
        'Meia',
        'Ponta',
        'Atacante',
      ]);
    });

    // Propriedade 5 — o que o banco tem vence o default.
    it('não sobrescreve positions já preenchido no banco', async () => {
      prisma.sport.findMany.mockResolvedValue([
        { id: '1', slug: 'soccer', name: 'Futebol', isActive: true, positions: ['Meu Goleiro'] },
      ]);

      const { sports } = await service.listActive();
      expect(sports[0].positions).toEqual(['Meu Goleiro']);
    });

    // Propriedade 6
    it('slug fora de DEFAULT_SPORTS com positions vazio devolve lista vazia', async () => {
      prisma.sport.findMany.mockResolvedValue([
        { id: '1', slug: 'xadrez-boxe', name: 'Xadrez-Boxe', isActive: true, positions: [] },
      ]);

      const { sports } = await service.listActive();
      expect(sports[0].positions).toEqual([]);
    });

    it('positions null (linha antiga) também cai no default', async () => {
      prisma.sport.findMany.mockResolvedValue([
        { id: '1', slug: 'tennis', name: 'Tênis', isActive: true, positions: null },
      ]);

      const { sports } = await service.listActive();
      expect(sports[0].positions).toEqual(['Simples', 'Duplas']);
    });
  });

  describe('listAll — GET admin', () => {
    // Propriedade 11
    it('não filtra por isActive e inclui a contagem de perfis', async () => {
      prisma.sport.findMany.mockResolvedValue([]);
      await service.listAll();

      expect(prisma.sport.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: { _count: { select: { profiles: true } } },
      });
    });
  });

  describe('create', () => {
    // Propriedade 12
    it.each([
      ['sem name', { slug: 'novo' }],
      ['sem slug', { name: 'Novo' }],
      ['name vazio', { name: '', slug: 'novo' }],
    ])('rejeita %s com 400', async (_label, input) => {
      await expect(service.create(input)).rejects.toThrow(BadRequestException);
      expect(prisma.sport.create).not.toHaveBeenCalled();
    });

    // Propriedade 13
    it.each([
      ['maiúsculas', 'Novo'],
      ['espaço', 'novo esporte'],
      ['acento', 'nataçao'],
      ['underscore', 'novo_esporte'],
      ['51 caracteres', 'a'.repeat(51)],
    ])('rejeita slug inválido (%s) com 400', async (_label, slug) => {
      await expect(service.create({ name: 'Novo', slug })).rejects.toThrow(BadRequestException);
    });

    // Propriedade 13 — o POST aceita até 50 (A4: o PATCH só aceita 30).
    it('aceita slug de 50 caracteres', async () => {
      prisma.sport.findUnique.mockResolvedValue(null);
      prisma.sport.create.mockResolvedValue({ id: '1' });

      await expect(service.create({ name: 'Novo', slug: 'a'.repeat(50) })).resolves.toBeDefined();
    });

    // Propriedade 14
    it('rejeita slug já existente com 409', async () => {
      prisma.sport.findUnique.mockResolvedValue({ id: 'ja-existe', slug: 'soccer' });

      await expect(service.create({ name: 'Futebol', slug: 'soccer' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.sport.create).not.toHaveBeenCalled();
    });

    // Propriedade 15
    it('cria com isActive true, aparando nome e slug', async () => {
      prisma.sport.findUnique.mockResolvedValue(null);
      prisma.sport.create.mockResolvedValue({ id: '1' });

      await service.create({ name: '  Novo  ', slug: '  novo  ', positions: ['A'] });

      expect(prisma.sport.create).toHaveBeenCalledWith({
        data: { name: 'Novo', slug: 'novo', positions: ['A'], isActive: true },
      });
    });

    it('positions não-array vira lista vazia', async () => {
      prisma.sport.findUnique.mockResolvedValue(null);
      prisma.sport.create.mockResolvedValue({ id: '1' });

      await service.create({ name: 'Novo', slug: 'novo', positions: 'nao-e-array' as never });

      expect(prisma.sport.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ positions: [] }) }),
      );
    });
  });

  describe('syncDefaults', () => {
    // Propriedade 16
    it('faz upsert de todos os padrões e informa a contagem', async () => {
      prisma.sport.upsert.mockResolvedValue({});
      const result = await service.syncDefaults();

      expect(prisma.sport.upsert).toHaveBeenCalledTimes(DEFAULT_SPORTS.length);
      expect(result.synced).toBe(DEFAULT_SPORTS.length);
    });

    it('faz upsert por slug, reativando o esporte', async () => {
      prisma.sport.upsert.mockResolvedValue({});
      await service.syncDefaults();

      const soccerCall = prisma.sport.upsert.mock.calls.find(
        ([arg]) => arg.where.slug === 'soccer',
      );
      expect(soccerCall![0].update).toEqual(
        expect.objectContaining({ name: 'Futebol', isActive: true }),
      );
    });
  });

  describe('update', () => {
    // Propriedade 17
    it('devolve 404 para esporte inexistente', async () => {
      prisma.sport.findUnique.mockResolvedValue(null);
      await expect(service.update('nao-existe', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    // Propriedade 18
    it('bloqueia desativação com atleta vinculado, com a contagem na mensagem', async () => {
      prisma.sport.findUnique.mockResolvedValue({ id: '1', slug: 'soccer' });
      prisma.athleteProfile.count.mockResolvedValue(3);

      await expect(service.update('1', { isActive: false })).rejects.toThrow(BadRequestException);

      const body = await bodyOfRejection(service.update('1', { isActive: false }));
      expect(body.error).toMatch(/3 atletas/);
      expect(body.canDelete).toBe(false);
      expect(prisma.sport.update).not.toHaveBeenCalled();
    });

    it('permite desativar quando não há atleta vinculado', async () => {
      prisma.sport.findUnique.mockResolvedValue({ id: '1', slug: 'soccer' });
      prisma.athleteProfile.count.mockResolvedValue(0);
      prisma.sport.update.mockResolvedValue({ id: '1' });

      await expect(service.update('1', { isActive: false })).resolves.toBeDefined();
    });

    it('não checa vínculo ao ATIVAR', async () => {
      prisma.sport.findUnique.mockResolvedValue({ id: '1', slug: 'soccer' });
      prisma.sport.update.mockResolvedValue({ id: '1' });

      await service.update('1', { isActive: true });
      expect(prisma.athleteProfile.count).not.toHaveBeenCalled();
    });

    // Propriedade 19
    it('rejeita slug pertencente a outro esporte com 409', async () => {
      prisma.sport.findUnique
        .mockResolvedValueOnce({ id: '1', slug: 'soccer' })
        .mockResolvedValueOnce({ id: '2', slug: 'futsal' });

      await expect(service.update('1', { slug: 'futsal' })).rejects.toThrow(ConflictException);
    });

    it('aceita o próprio slug sem conflito', async () => {
      prisma.sport.findUnique
        .mockResolvedValueOnce({ id: '1', slug: 'soccer' })
        .mockResolvedValueOnce({ id: '1', slug: 'soccer' });
      prisma.sport.update.mockResolvedValue({ id: '1' });

      await expect(service.update('1', { slug: 'soccer' })).resolves.toBeDefined();
    });

    // Propriedade 20 — A4: aqui o limite é 30, não 50.
    it('rejeita slug de 31 caracteres, embora o create aceite 50', async () => {
      prisma.sport.findUnique.mockResolvedValue({ id: '1', slug: 'soccer' });

      await expect(service.update('1', { slug: 'a'.repeat(31) })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('aceita slug de 30 caracteres', async () => {
      prisma.sport.findUnique
        .mockResolvedValueOnce({ id: '1', slug: 'soccer' })
        .mockResolvedValueOnce(null);
      prisma.sport.update.mockResolvedValue({ id: '1' });

      await expect(service.update('1', { slug: 'a'.repeat(30) })).resolves.toBeDefined();
    });

    it.each([
      ['name vazio', { name: '   ' }],
      ['name com 51 caracteres', { name: 'a'.repeat(51) }],
    ])('rejeita %s com 400', async (_label, patch) => {
      prisma.sport.findUnique.mockResolvedValue({ id: '1', slug: 'soccer' });
      await expect(service.update('1', patch)).rejects.toThrow(BadRequestException);
    });

    // Propriedade 21
    it('aplica só os campos presentes no corpo', async () => {
      prisma.sport.findUnique.mockResolvedValue({ id: '1', slug: 'soccer' });
      prisma.sport.update.mockResolvedValue({ id: '1' });

      await service.update('1', { name: 'Novo Nome' });

      expect(prisma.sport.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'Novo Nome' },
      });
    });

    it('corpo vazio não altera nada além de tocar a linha', async () => {
      prisma.sport.findUnique.mockResolvedValue({ id: '1', slug: 'soccer' });
      prisma.sport.update.mockResolvedValue({ id: '1' });

      await service.update('1', {});
      expect(prisma.sport.update).toHaveBeenCalledWith({ where: { id: '1' }, data: {} });
    });
  });

  describe('remove', () => {
    // Propriedade 22
    it('bloqueia exclusão com atleta vinculado, sem apagar', async () => {
      prisma.sport.findUnique.mockResolvedValue({ id: '1' });
      prisma.athleteProfile.count.mockResolvedValue(2);

      await expect(service.remove('1')).rejects.toThrow(BadRequestException);

      const body = await bodyOfRejection(service.remove('1'));
      expect(body.error).toMatch(/2 atletas/);
      expect(prisma.sport.delete).not.toHaveBeenCalled();
    });

    // Propriedade 23
    it('apaga quando não há vínculo', async () => {
      prisma.sport.findUnique.mockResolvedValue({ id: '1' });
      prisma.athleteProfile.count.mockResolvedValue(0);
      prisma.sport.delete.mockResolvedValue({ id: '1' });

      await expect(service.remove('1')).resolves.toEqual({
        success: true,
        message: 'Esporte excluído com sucesso.',
      });
      expect(prisma.sport.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    // Propriedade 24 — D14, única divergência deliberada: o legado dava 500.
    it('devolve 404 para esporte inexistente, não 500', async () => {
      prisma.sport.findUnique.mockResolvedValue(null);

      await expect(service.remove('nao-existe')).rejects.toThrow(NotFoundException);
      expect(prisma.sport.delete).not.toHaveBeenCalled();
      // A checagem de existência vem ANTES da de vínculo — senão um id
      // inexistente contaria perfis de nada e responderia 400.
      expect(prisma.athleteProfile.count).not.toHaveBeenCalled();
    });
  });
});
