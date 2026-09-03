import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { ROLES } from '@/common/constants';
import { parseLimit, parsePage } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import { ExerciseStorageService } from './exercise-storage.service';
import { AtualizarExercicioBody, CriarExercicioBody } from './dtos';
import { ListarExerciciosQuery } from '@/common/queries';

const VALID_CATEGORIES = [
  'Técnico',
  'Físico',
  'Tático',
  'Mental',
  'Aquecimento',
  'Recuperação',
  'Finalização',
  'Goleiro',
  'Outro',
] as const;
const VALID_DIFFICULTIES = ['Iniciante', 'Intermediário', 'Avançado', 'Profissional'] as const;
const ASSINATURAS_ATIVAS = ['active', 'trialing', 'past_due', 'canceling'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarCapitalizacao(valor: string): string {
  const v = valor.trim();
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

/**
 * Fatia 23 — biblioteca de exercícios (docs/implementation-plans/epic-nest-exercises.md).
 */
@Injectable()
export class ExercisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ExerciseStorageService,
  ) {}

  private ehTreinador(user: SessionPayload): boolean {
    return Boolean(user.roles?.includes(ROLES.PROFESSIONAL)) || user.isAdmin;
  }

  private async temAssinaturaOuParceriaAtiva(user: SessionPayload): Promise<boolean> {
    if (user.isAdmin) return true;

    const conta = await this.prisma.partnerAccount.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (conta?.status === 'approved') return true;

    return Boolean(user.subscriptionStatus && ASSINATURAS_ATIVAS.includes(user.subscriptionStatus));
  }

  async listar(user: SessionPayload, query: ListarExerciciosQuery): Promise<unknown> {
    if (!this.ehTreinador(user)) throw new ForbiddenException({ error: 'Não autorizado.' });

    const search = (query.q ?? query.search ?? '').trim().slice(0, 100);
    const page = parsePage(query.page);
    const limit = parseLimit(query.limit, DEFAULT_LIMIT, MAX_LIMIT);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { OR: [{ trainerId: null }, { trainerId: user.id }] };

    if (query.category && query.category !== 'all') {
      where.category = { equals: query.category, mode: 'insensitive' };
    }
    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }
    if (query.ids) {
      const ids = query.ids.split(',').filter(Boolean).slice(0, 50);
      if (ids.length > 0) where.id = { in: ids };
    }

    const [exercises, total, settings] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        orderBy: [{ trainerId: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          difficulty: true,
          videoUrl: true,
          videoPublicId: true,
          hlsProcessed: true,
          processingProgress: true,
          videoStorageProvider: true,
          originalVideoKey: true,
          trainerId: true,
        },
      }),
      this.prisma.exercise.count({ where }),
      this.prisma.systemSettings.findFirst({
        select: { enableVideoHoverPreview: true, videoHoverType: true, storageProvider: true },
      }),
    ]);

    return {
      exercises,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
      enableVideoHoverPreview: settings?.enableVideoHoverPreview ?? true,
      videoHoverType: settings?.videoHoverType ?? 'TEASER',
      storageProvider: settings?.storageProvider ?? 'r2',
    };
  }

  async criar(user: SessionPayload, body: CriarExercicioBody): Promise<unknown> {
    if (!this.ehTreinador(user)) throw new ForbiddenException({ error: 'Não autorizado.' });
    if (!(await this.temAssinaturaOuParceriaAtiva(user))) {
      throw new ForbiddenException({ error: 'Assinatura inativa. Por favor, assine um plano ou ative o teste grátis.' });
    }

    const name = typeof body.name === 'string' ? body.name : undefined;
    const description = typeof body.description === 'string' ? body.description : undefined;
    const rawCategory = typeof body.category === 'string' ? body.category.trim() : '';
    const difficulty = typeof body.difficulty === 'string' ? body.difficulty : undefined;

    if (!name || !description || !rawCategory || !difficulty) {
      throw new BadRequestException({ error: 'Campos obrigatórios ausentes.' });
    }
    if (name.length > 100) throw new BadRequestException({ error: 'Nome deve ter no máximo 100 caracteres.' });
    if (description.length > 50000) {
      throw new BadRequestException({ error: 'Descrição muito longa (máx. 50.000 caracteres).' });
    }
    if (stripHtml(description).length === 0) {
      throw new BadRequestException({ error: 'A descrição não pode estar vazia.' });
    }

    const category = normalizarCapitalizacao(rawCategory);
    if (!(VALID_CATEGORIES as readonly string[]).includes(category)) {
      throw new BadRequestException({ error: `Categoria inválida. Aceitas: ${VALID_CATEGORIES.join(', ')}` });
    }
    const normalizedDifficulty = normalizarCapitalizacao(difficulty);
    if (!(VALID_DIFFICULTIES as readonly string[]).includes(normalizedDifficulty)) {
      throw new BadRequestException({ error: `Dificuldade inválida. Aceitas: ${VALID_DIFFICULTIES.join(', ')}` });
    }

    const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl : undefined;
    const isR2Upload = videoUrl?.startsWith('/api/videos/') ?? false;

    const exercise = await this.prisma.exercise.create({
      data: {
        name,
        description,
        category,
        difficulty: normalizedDifficulty,
        videoUrl: videoUrl ?? null,
        videoPublicId: typeof body.videoPublicId === 'string' ? body.videoPublicId : null,
        hlsProcessed: isR2Upload ? false : ((body.hlsProcessed as boolean | undefined) ?? true),
        videoStorageProvider: isR2Upload ? 'r2' : 'cloudinary',
        originalVideoKey: typeof body.originalVideoKey === 'string' ? body.originalVideoKey : null,
        trainerId: user.id,
      },
    });

    if (isR2Upload) void this.storage.dispararProcessamentoDeVideo();
    void this.gerarESalvarResumo(exercise.id, name, description, category);

    return { exercise, message: 'Exercício criado com sucesso' };
  }

  async buscar(id: string, user: SessionPayload): Promise<unknown> {
    const exercise = await this.prisma.exercise.findUnique({ where: { id } });
    if (!exercise) throw new NotFoundException({ error: 'Exercício não encontrado.' });

    const isGlobal = exercise.trainerId === null;
    const isOwner = exercise.trainerId === user.id;
    const isSystemAdmin = user.isAdmin;

    const isStudentWithPlan =
      !isGlobal && !isOwner && !isSystemAdmin && exercise.trainerId
        ? (await this.prisma.trainingPlan.count({
            where: {
              trainerId: exercise.trainerId,
              OR: [{ athleteId: user.id }, { student: { userId: user.id } }],
            },
          })) > 0
        : false;

    if (!isGlobal && !isOwner && !isSystemAdmin && !isStudentWithPlan) {
      throw new ForbiddenException({ error: 'Sem permissão para acessar este exercício.' });
    }

    return { exercise };
  }

  /**
   * A88 — o legado exigia `ROLES.PROFESSIONAL` sem bypass de admin (nem no
   * gate de papel, nem na checagem de dono), diferente de GET/POST/DELETE.
   * O próprio DELETE já documenta essa classe de bug como BUG-73
   * ("inconsistente com todos os outros endpoints, admins recebiam 401").
   * Mesmo raciocínio aplicado aqui: um admin que pode apagar tem que poder
   * editar.
   */
  async atualizar(id: string, user: SessionPayload, body: AtualizarExercicioBody): Promise<unknown> {
    if (!this.ehTreinador(user)) throw new ForbiddenException({ error: 'Não autorizado.' });
    if (!(await this.temAssinaturaOuParceriaAtiva(user))) {
      throw new ForbiddenException({ error: 'Assinatura inativa.' });
    }

    const existente = await this.prisma.exercise.findUnique({ where: { id } });
    if (!existente) throw new NotFoundException({ error: 'Exercício não encontrado.' });
    if (existente.trainerId !== user.id && !user.isAdmin) {
      throw new ForbiddenException({
        error: 'Você não tem permissão para editar este exercício global ou de outro treinador.',
      });
    }

    if (body.name !== undefined && body.name.length > 100) {
      throw new BadRequestException({ error: 'name deve ter no máximo 100 caracteres.' });
    }
    if (body.description !== undefined && body.description.length > 50000) {
      throw new BadRequestException({ error: 'Descrição muito longa (máx. 50.000 caracteres).' });
    }
    if (body.description !== undefined && stripHtml(body.description).length === 0) {
      throw new BadRequestException({ error: 'A descrição não pode estar vazia.' });
    }

    let normalizedCategory: string | undefined;
    if (body.category !== undefined) {
      normalizedCategory = normalizarCapitalizacao(body.category);
      if (!(VALID_CATEGORIES as readonly string[]).includes(normalizedCategory)) {
        throw new BadRequestException({ error: `category inválida. Use: ${VALID_CATEGORIES.join(', ')}` });
      }
    }
    let normalizedDifficulty: string | undefined;
    if (body.difficulty !== undefined) {
      normalizedDifficulty = normalizarCapitalizacao(body.difficulty);
      if (!(VALID_DIFFICULTIES as readonly string[]).includes(normalizedDifficulty)) {
        throw new BadRequestException({ error: `difficulty inválida. Use: ${VALID_DIFFICULTIES.join(', ')}` });
      }
    }

    const exercise = await this.prisma.exercise.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        category: normalizedCategory,
        difficulty: normalizedDifficulty,
        videoUrl: body.videoUrl || null,
        videoPublicId: body.videoPublicId || null,
        ...(body.description !== undefined ? { aiSummary: null } : {}),
      },
    });

    if (body.description !== undefined) void this.gerarESalvarResumo(exercise.id, exercise.name, exercise.description, exercise.category);

    return { exercise, message: 'Exercício atualizado' };
  }

  async remover(id: string, user: SessionPayload): Promise<unknown> {
    if (!user.roles?.includes(ROLES.PROFESSIONAL) && !user.isAdmin) {
      throw new ForbiddenException({ error: 'Não autorizado.' });
    }

    const existente = await this.prisma.exercise.findUnique({ where: { id } });
    if (!existente) throw new NotFoundException({ error: 'Exercício não encontrado.' });
    if (existente.trainerId !== user.id && !user.isAdmin) {
      throw new ForbiddenException({ error: 'Sem permissão.' });
    }

    if (existente.videoStorageProvider === 'r2' && existente.originalVideoKey) {
      const keyParts = existente.originalVideoKey.split('/');
      const prefix = `${keyParts.slice(0, 3).join('/')}/`;
      await this.storage.apagarArquivos(prefix).catch(() => {});
    }

    await this.prisma.exercise.delete({ where: { id } });
    return { message: 'Exercício apagado com sucesso.' };
  }

  private async gerarESalvarResumo(id: string, name: string, description: string, category: string): Promise<void> {
    if (process.env.AI_MOCK === 'true') {
      const mock = `Resumo mock de ${name} (${category})`;
      await this.prisma.exercise.update({ where: { id }, data: { aiSummary: mock } }).catch(() => {});
      return;
    }
    try {
      const plain = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
      const prompt = `Você é um assistente esportivo. Resuma o exercício abaixo em 1 ou 2 frases curtas e objetivas, explicando apenas O QUE é o exercício e PARA QUE serve. Não inclua instruções de execução, detalhes técnicos ou pontuação no final.\n\nExercício: ${name}\nCategoria: ${category}\nDescrição: ${plain}\n\nResponda APENAS com o resumo, sem aspas, sem prefixos como "Resumo:" ou "O exercício".`;
      let summary: string | null = null;
      if (process.env.GROQ_API_KEY) {
        const Groq = (await import('groq-sdk')).default;
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const r = await groq.chat.completions.create({ model: 'llama-3.1-8b-instant', temperature: 0.3, max_tokens: 80, messages: [{ role: 'user', content: prompt }] });
        summary = r.choices?.[0]?.message?.content?.trim() ?? null;
      }
      if (!summary && process.env.GEMINI_API_KEY) {
        const geminiModel = (await this.prisma.systemSettings.findFirst({ select: { geminiModel: true } }).catch(() => null))?.geminiModel ?? 'gemini-2.0-flash';
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 80, temperature: 0.3 } }),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const data: any = await res.json();
          summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
        }
      }
      if (!summary) return;
      await this.prisma.exercise.update({ where: { id }, data: { aiSummary: summary } });
    } catch (e) {
      // fire-and-forget: não derruba a criação do exercício
      console.warn('[AI_SUMMARY]', (e as Error).message);
    }
  }
}
