import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { ExercisesService } from './exercises.service';

function prismaMock() {
  return {
    exercise: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    systemSettings: { findFirst: jest.fn() },
    partnerAccount: { findUnique: jest.fn() },
    trainingPlan: { count: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function storageMock() {
  return {
    dispararProcessamentoDeVideo: jest.fn().mockResolvedValue(undefined),
    apagarArquivos: jest.fn().mockResolvedValue(undefined),
  };
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

const TRAINER = 'trainer-1';

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: TRAINER,
    name: 'Treinador',
    email: 'treinador@example.com',
    image: null,
    roles: ['PROFESSIONAL'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: null,
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

function exercicioRow(over: Record<string, unknown> = {}) {
  return {
    id: 'ex-1',
    name: 'Rondo 4x2',
    description: 'Descrição válida.',
    category: 'Técnico',
    difficulty: 'Intermediário',
    videoUrl: null,
    videoPublicId: null,
    hlsProcessed: true,
    videoStorageProvider: 'cloudinary',
    originalVideoKey: null,
    trainerId: TRAINER,
    ...over,
  };
}

const CAMPOS_VALIDOS = {
  name: 'Rondo 4x2',
  description: 'Descrição técnica válida com detalhes suficientes.',
  category: 'técnico',
  difficulty: 'intermediário',
};

describe('ExercisesService', () => {
  let prisma: PrismaMock;
  let storage: ReturnType<typeof storageMock>;
  let service: ExercisesService;

  beforeEach(() => {
    prisma = prismaMock();
    storage = storageMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ExercisesService(prisma as any, storage as any);

    prisma.exercise.findMany.mockResolvedValue([]);
    prisma.exercise.count.mockResolvedValue(0);
    prisma.systemSettings.findFirst.mockResolvedValue(null);
    prisma.partnerAccount.findUnique.mockResolvedValue(null);
    prisma.exercise.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'ex-novo',
      ...args.data,
    }));
    prisma.exercise.findUnique.mockResolvedValue(exercicioRow());
    prisma.exercise.update.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      ...exercicioRow(),
      ...args.data,
    }));
  });

  /* ────────────────────────────────────────────────────────────────────────
   * listar — GET /exercises
   * ──────────────────────────────────────────────────────────────────────── */

  describe('listar', () => {
    it('403 quando não é PROFESSIONAL nem admin', async () => {
      const body = await bodyOfRejection(service.listar(sessao({ roles: ['CLIENT'] }), {}));
      expect(body.error).toBeDefined();
      expect(prisma.exercise.findMany).not.toHaveBeenCalled();
    });

    it('where sempre inclui exercícios globais e os do próprio treinador', async () => {
      await service.listar(sessao(), {});
      const where = (prisma.exercise.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.OR).toEqual([{ trainerId: null }, { trainerId: TRAINER }]);
    });

    it('filtra por categoria quando informada e diferente de "all"', async () => {
      await service.listar(sessao(), { category: 'Físico' });
      const where = (prisma.exercise.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.category).toEqual({ equals: 'Físico', mode: 'insensitive' });
    });

    it('ignora o filtro de categoria quando o valor é "all"', async () => {
      await service.listar(sessao(), { category: 'all' });
      const where = (prisma.exercise.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.category).toBeUndefined();
    });

    it('filtra por busca em nome ou descrição', async () => {
      await service.listar(sessao(), { q: 'rondo' });
      const where = (prisma.exercise.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.AND).toEqual([
        { OR: [{ name: { contains: 'rondo', mode: 'insensitive' } }, { description: { contains: 'rondo', mode: 'insensitive' } }] },
      ]);
    });

    it('filtra por lista de ids, no máximo 50', async () => {
      const muitos = Array.from({ length: 60 }, (_, i) => `id-${i}`).join(',');
      await service.listar(sessao(), { ids: muitos });
      const where = (prisma.exercise.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.id.in).toHaveLength(50);
    });

    it('pagina com page=1 e limit=50 por padrão, e clampa limit a 100', async () => {
      await service.listar(sessao(), {});
      expect((prisma.exercise.findMany as jest.Mock).mock.calls[0][0]).toMatchObject({ skip: 0, take: 50 });

      await service.listar(sessao(), { limit: '500' });
      expect((prisma.exercise.findMany as jest.Mock).mock.calls[1][0]).toMatchObject({ take: 100 });
    });

    it('usa os defaults de exibição de vídeo quando não há SystemSettings', async () => {
      const resultado = (await service.listar(sessao(), {})) as Record<string, unknown>;
      expect(resultado).toMatchObject({
        enableVideoHoverPreview: true,
        videoHoverType: 'TEASER',
        storageProvider: 'r2',
      });
    });

    it('retorna os campos de SystemSettings quando existem', async () => {
      prisma.systemSettings.findFirst.mockResolvedValue({
        enableVideoHoverPreview: false,
        videoHoverType: 'FULL',
        storageProvider: 'cloudinary',
      });
      const resultado = (await service.listar(sessao(), {})) as Record<string, unknown>;
      expect(resultado).toMatchObject({
        enableVideoHoverPreview: false,
        videoHoverType: 'FULL',
        storageProvider: 'cloudinary',
      });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * criar — POST /exercises
   * ──────────────────────────────────────────────────────────────────────── */

  describe('criar', () => {
    it('403 quando não é PROFESSIONAL nem admin', async () => {
      const body = await bodyOfRejection(service.criar(sessao({ roles: ['CLIENT'] }), CAMPOS_VALIDOS));
      expect(body.error).toBeDefined();
    });

    it('403 (assinatura inativa) sem partner aprovado nem assinatura ativa', async () => {
      const body = await bodyOfRejection(service.criar(sessao({ subscriptionStatus: 'canceled' }), CAMPOS_VALIDOS));
      expect(body.error).toMatch(/[Aa]ssinatura/);
    });

    it('admin ignora o gate de assinatura', async () => {
      await service.criar(sessao({ isAdmin: true, systemRoles: ['ADMIN'] }), CAMPOS_VALIDOS);
      expect(prisma.exercise.create).toHaveBeenCalled();
    });

    it('parceiro aprovado ignora o gate de assinatura mesmo sem subscriptionStatus', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      await service.criar(sessao(), CAMPOS_VALIDOS);
      expect(prisma.exercise.create).toHaveBeenCalled();
    });

    it.each(['active', 'trialing', 'past_due', 'canceling'])(
      'subscriptionStatus "%s" passa pelo gate mesmo sem partner aprovado',
      async (status) => {
        await service.criar(sessao({ subscriptionStatus: status }), CAMPOS_VALIDOS);
        expect(prisma.exercise.create).toHaveBeenCalled();
      },
    );

    it.each([
      ['name', { ...CAMPOS_VALIDOS, name: undefined }],
      ['description', { ...CAMPOS_VALIDOS, description: undefined }],
      ['category', { ...CAMPOS_VALIDOS, category: undefined }],
      ['difficulty', { ...CAMPOS_VALIDOS, difficulty: undefined }],
    ])('400 quando falta %s', async (_campo, body) => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const resposta = await bodyOfRejection(service.criar(sessao(), body));
      expect(resposta.error).toMatch(/obrigat/i);
    });

    it('400 quando o nome excede 100 caracteres', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const body = await bodyOfRejection(
        service.criar(sessao(), { ...CAMPOS_VALIDOS, name: 'x'.repeat(101) }),
      );
      expect(body.error).toMatch(/100/);
    });

    it('400 quando a descrição excede 50000 caracteres', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const body = await bodyOfRejection(
        service.criar(sessao(), { ...CAMPOS_VALIDOS, description: 'x'.repeat(50001) }),
      );
      expect(body.error).toMatch(/50.000|50000/);
    });

    it('400 quando a descrição é semanticamente vazia (só tags HTML)', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const body = await bodyOfRejection(
        service.criar(sessao(), { ...CAMPOS_VALIDOS, description: '<p></p>' }),
      );
      expect(body.error).toMatch(/vazia/i);
    });

    it('400 quando a categoria é inválida', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const body = await bodyOfRejection(
        service.criar(sessao(), { ...CAMPOS_VALIDOS, category: 'inventada' }),
      );
      expect(body.error).toMatch(/[Cc]ategoria/);
    });

    it('400 quando a dificuldade é inválida', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const body = await bodyOfRejection(
        service.criar(sessao(), { ...CAMPOS_VALIDOS, difficulty: 'lendário' }),
      );
      expect(body.error).toMatch(/[Dd]ificuldade/);
    });

    it('normaliza categoria e dificuldade (capitaliza a primeira letra)', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      await service.criar(sessao(), CAMPOS_VALIDOS);
      const dados = (prisma.exercise.create as jest.Mock).mock.calls[0][0].data;
      expect(dados.category).toBe('Técnico');
      expect(dados.difficulty).toBe('Intermediário');
    });

    it('cria com trainerId do requisitante', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      await service.criar(sessao(), CAMPOS_VALIDOS);
      const dados = (prisma.exercise.create as jest.Mock).mock.calls[0][0].data;
      expect(dados.trainerId).toBe(TRAINER);
    });

    it('upload R2 (/api/videos/...): hlsProcessed false, provider r2, dispara processamento', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      await service.criar(sessao(), { ...CAMPOS_VALIDOS, videoUrl: '/api/videos/abc.mp4' });

      const dados = (prisma.exercise.create as jest.Mock).mock.calls[0][0].data;
      expect(dados.hlsProcessed).toBe(false);
      expect(dados.videoStorageProvider).toBe('r2');
      expect(storage.dispararProcessamentoDeVideo).toHaveBeenCalled();
    });

    it('upload não-R2: provider cloudinary, NÃO dispara processamento', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      await service.criar(sessao(), { ...CAMPOS_VALIDOS, videoUrl: 'https://cloudinary.com/abc.mp4' });

      const dados = (prisma.exercise.create as jest.Mock).mock.calls[0][0].data;
      expect(dados.videoStorageProvider).toBe('cloudinary');
      expect(storage.dispararProcessamentoDeVideo).not.toHaveBeenCalled();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * buscar — GET /exercises/:id
   * ──────────────────────────────────────────────────────────────────────── */

  describe('buscar', () => {
    it('404 quando não existe', async () => {
      prisma.exercise.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.buscar('inexistente', sessao()));
      expect(body.error).toBeDefined();
    });

    it('dono vê o próprio exercício', async () => {
      const resultado = (await service.buscar('ex-1', sessao())) as Record<string, unknown>;
      expect(resultado.exercise).toBeDefined();
    });

    it('qualquer autenticado vê exercício global (trainerId null)', async () => {
      prisma.exercise.findUnique.mockResolvedValue(exercicioRow({ trainerId: null }));
      const resultado = (await service.buscar('ex-1', sessao({ id: 'outro' }))) as Record<string, unknown>;
      expect(resultado.exercise).toBeDefined();
    });

    it('admin vê exercício de qualquer treinador', async () => {
      const resultado = (await service.buscar(
        'ex-1',
        sessao({ id: 'outro', isAdmin: true, systemRoles: ['ADMIN'] }),
      )) as Record<string, unknown>;
      expect(resultado.exercise).toBeDefined();
    });

    it('aluno com plano ativo do treinador dono vê o exercício', async () => {
      prisma.trainingPlan.count.mockResolvedValue(1);
      const resultado = (await service.buscar(
        'ex-1',
        sessao({ id: 'aluno-1', roles: ['CLIENT'] }),
      )) as Record<string, unknown>;
      expect(resultado.exercise).toBeDefined();
    });

    it('403 quando não é dono, global, admin, nem aluno com plano', async () => {
      prisma.trainingPlan.count.mockResolvedValue(0);
      const body = await bodyOfRejection(service.buscar('ex-1', sessao({ id: 'estranho', roles: ['CLIENT'] })));
      expect(body.error).toBeDefined();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * atualizar — PUT /exercises/:id
   * ──────────────────────────────────────────────────────────────────────── */

  describe('atualizar', () => {
    it('403 quando não é PROFESSIONAL nem admin', async () => {
      const body = await bodyOfRejection(service.atualizar('ex-1', sessao({ roles: ['CLIENT'] }), {}));
      expect(body.error).toBeDefined();
    });

    it('A88 — admin sem papel PROFESSIONAL consegue editar (paridade com GET/POST/DELETE)', async () => {
      await service.atualizar('ex-1', sessao({ roles: [], isAdmin: true, systemRoles: ['ADMIN'] }), {
        name: 'Novo nome',
      });
      expect(prisma.exercise.update).toHaveBeenCalled();
    });

    it('403 (assinatura inativa) sem partner aprovado nem assinatura ativa', async () => {
      const body = await bodyOfRejection(
        service.atualizar('ex-1', sessao({ subscriptionStatus: 'canceled' }), { name: 'x' }),
      );
      expect(body.error).toMatch(/[Aa]ssinatura/);
    });

    it('admin ignora o gate de assinatura', async () => {
      await service.atualizar('ex-1', sessao({ isAdmin: true, systemRoles: ['ADMIN'] }), { name: 'Novo' });
      expect(prisma.exercise.update).toHaveBeenCalled();
    });

    it('404 quando o exercício não existe', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      prisma.exercise.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.atualizar('inexistente', sessao(), { name: 'x' }));
      expect(body.error).toBeDefined();
    });

    it('403 quando quem edita não é o dono nem admin', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const body = await bodyOfRejection(
        service.atualizar('ex-1', sessao({ id: 'outro-treinador' }), { name: 'x' }),
      );
      expect(body.error).toMatch(/permiss/i);
    });

    it('A88 — admin não-dono consegue editar (paridade com DELETE, BUG-73)', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      await service.atualizar(
        'ex-1',
        sessao({ id: 'outro-treinador', isAdmin: true, systemRoles: ['ADMIN'] }),
        { name: 'Editado por admin' },
      );
      expect(prisma.exercise.update).toHaveBeenCalled();
    });

    it('400 quando o nome informado excede 100 caracteres', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const body = await bodyOfRejection(
        service.atualizar('ex-1', sessao(), { name: 'x'.repeat(101) }),
      );
      expect(body.error).toMatch(/100/);
    });

    it('400 quando a descrição informada excede 50000 caracteres', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const body = await bodyOfRejection(
        service.atualizar('ex-1', sessao(), { description: 'x'.repeat(50001) }),
      );
      expect(body.error).toMatch(/50.000|50000/);
    });

    it('400 quando a descrição informada é semanticamente vazia', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const body = await bodyOfRejection(service.atualizar('ex-1', sessao(), { description: '<p></p>' }));
      expect(body.error).toMatch(/vazia/i);
    });

    it('400 quando a categoria informada é inválida', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const body = await bodyOfRejection(service.atualizar('ex-1', sessao(), { category: 'inventada' }));
      expect(body.error).toMatch(/category inv/i);
    });

    it('400 quando a dificuldade informada é inválida', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      const body = await bodyOfRejection(service.atualizar('ex-1', sessao(), { difficulty: 'lendário' }));
      expect(body.error).toMatch(/difficulty inv/i);
    });

    it('não valida campos que não foram informados (edição parcial)', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      await service.atualizar('ex-1', sessao(), { name: 'Só o nome muda' });
      expect(prisma.exercise.update).toHaveBeenCalled();
    });

    it('limpa aiSummary quando a descrição é editada', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      await service.atualizar('ex-1', sessao(), { description: 'Nova descrição válida.' });
      const dados = (prisma.exercise.update as jest.Mock).mock.calls[0][0].data;
      expect(dados.aiSummary).toBeNull();
    });

    it('não mexe em aiSummary quando a descrição não é editada', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
      await service.atualizar('ex-1', sessao(), { name: 'Só o nome' });
      const dados = (prisma.exercise.update as jest.Mock).mock.calls[0][0].data;
      expect(dados.aiSummary).toBeUndefined();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * remover — DELETE /exercises/:id
   * ──────────────────────────────────────────────────────────────────────── */

  describe('remover', () => {
    it('403 quando não é PROFESSIONAL nem admin', async () => {
      const body = await bodyOfRejection(service.remover('ex-1', sessao({ roles: ['CLIENT'] })));
      expect(body.error).toBeDefined();
    });

    it('404 quando o exercício não existe', async () => {
      prisma.exercise.findUnique.mockResolvedValue(null);
      const body = await bodyOfRejection(service.remover('inexistente', sessao()));
      expect(body.error).toBeDefined();
    });

    it('403 quando não é dono nem admin', async () => {
      const body = await bodyOfRejection(service.remover('ex-1', sessao({ id: 'outro' })));
      expect(body.error).toMatch(/permiss/i);
    });

    it('admin remove exercício de outro treinador', async () => {
      await service.remover('ex-1', sessao({ id: 'outro', isAdmin: true, systemRoles: ['ADMIN'] }));
      expect(prisma.exercise.delete).toHaveBeenCalledWith({ where: { id: 'ex-1' } });
    });

    it('dono remove o próprio exercício', async () => {
      await service.remover('ex-1', sessao());
      expect(prisma.exercise.delete).toHaveBeenCalledWith({ where: { id: 'ex-1' } });
    });

    it('limpa arquivos no R2 quando o provider é r2 e há originalVideoKey', async () => {
      prisma.exercise.findUnique.mockResolvedValue(
        exercicioRow({ videoStorageProvider: 'r2', originalVideoKey: `videos/${TRAINER}/abc/original.mp4` }),
      );
      await service.remover('ex-1', sessao());
      expect(storage.apagarArquivos).toHaveBeenCalledWith(`videos/${TRAINER}/abc/`);
    });

    it('não chama limpeza do R2 quando o provider é cloudinary, mesmo com originalVideoKey preenchido', async () => {
      prisma.exercise.findUnique.mockResolvedValue(
        exercicioRow({ videoStorageProvider: 'cloudinary', originalVideoKey: `videos/${TRAINER}/abc/original.mp4` }),
      );
      await service.remover('ex-1', sessao());
      expect(storage.apagarArquivos).not.toHaveBeenCalled();
    });

    it('não chama limpeza do R2 quando não há originalVideoKey', async () => {
      prisma.exercise.findUnique.mockResolvedValue(exercicioRow({ videoStorageProvider: 'r2', originalVideoKey: null }));
      await service.remover('ex-1', sessao());
      expect(storage.apagarArquivos).not.toHaveBeenCalled();
    });

    it('apaga o exercício mesmo se a limpeza do R2 falhar', async () => {
      prisma.exercise.findUnique.mockResolvedValue(
        exercicioRow({ videoStorageProvider: 'r2', originalVideoKey: `videos/${TRAINER}/abc/original.mp4` }),
      );
      storage.apagarArquivos.mockRejectedValue(new Error('R2 fora do ar'));

      await service.remover('ex-1', sessao());
      expect(prisma.exercise.delete).toHaveBeenCalled();
    });
  });
});
