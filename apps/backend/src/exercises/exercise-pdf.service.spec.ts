import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { ExercisePdfService } from './exercise-pdf.service';

function prismaMock() {
  return { exercise: { findUnique: jest.fn() } };
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
    description: 'Descrição técnica.',
    category: 'Técnico',
    difficulty: 'Intermediário',
    videoUrl: null,
    trainerId: TRAINER,
    ...over,
  };
}

describe('ExercisePdfService', () => {
  let prisma: PrismaMock;
  let service: ExercisePdfService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ExercisePdfService(prisma as any);
    prisma.exercise.findUnique.mockResolvedValue(exercicioRow());
  });

  it('404 quando o exercício não existe', async () => {
    prisma.exercise.findUnique.mockResolvedValue(null);
    const body = await bodyOfRejection(service.gerar('inexistente', sessao()));
    expect(body.error).toBeDefined();
  });

  it('dono gera o PDF', async () => {
    const resultado = await service.gerar('ex-1', sessao());
    expect(resultado.bytes.length).toBeGreaterThan(0);
  });

  it('qualquer autenticado gera o PDF de um exercício global', async () => {
    prisma.exercise.findUnique.mockResolvedValue(exercicioRow({ trainerId: null }));
    const resultado = await service.gerar('ex-1', sessao({ id: 'outro' }));
    expect(resultado.bytes.length).toBeGreaterThan(0);
  });

  it('admin gera o PDF de exercício de outro treinador', async () => {
    const resultado = await service.gerar('ex-1', sessao({ id: 'outro', isAdmin: true, systemRoles: ['ADMIN'] }));
    expect(resultado.bytes.length).toBeGreaterThan(0);
  });

  it('403 quando não é dono, global, nem admin — MESMO com plano ativo do treinador (sem o bypass de aluno que o GET tem)', async () => {
    const body = await bodyOfRejection(service.gerar('ex-1', sessao({ id: 'aluno-1', roles: ['CLIENT'] })));
    expect(body.error).toBeDefined();
  });

  it('nome do arquivo sanitiza caracteres especiais', async () => {
    prisma.exercise.findUnique.mockResolvedValue(exercicioRow({ name: 'Rondô 4x2 (avançado)!' }));
    const resultado = await service.gerar('ex-1', sessao());
    expect(resultado.filename).toMatch(/^cheat_sheet_[a-zA-Z0-9_]+\.pdf$/);
  });
});
