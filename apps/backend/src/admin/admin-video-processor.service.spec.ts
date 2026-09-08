import { HttpException } from '@nestjs/common';

import { AdminVideoProcessorService } from './admin-video-processor.service';

function prismaMock() {
  return { exercise: { findMany: jest.fn(), update: jest.fn() } };
}

async function bodyOfRejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error('esperava rejeição, mas resolveu');
  } catch (err) {
    if (err instanceof HttpException) throw err;
    return String(err instanceof Error ? err.message : err);
  }
}

/**
 * Fatia 35 (lote 2c) — RED. Video-processor update: id + clamp.
 */
describe('AdminVideoProcessorService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminVideoProcessorService(prisma as any);
    prisma.exercise.findMany.mockResolvedValue([]);
  });

  it('sem id → erro', async () => {
    const msg = await bodyOfRejection(service.atualizar({}));
    expect(msg).toMatch(/id obrigatório/i);
    expect(prisma.exercise.update).not.toHaveBeenCalled();
  });

  it('progresso é clampado 0–100', async () => {
    prisma.exercise.update.mockResolvedValue({ id: 'e1' });
    await service.atualizar({ id: 'e1', processingProgress: 999 });
    expect(prisma.exercise.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processingProgress: 100 }) }),
    );
  });

  it('[controle] hlsProcessed true zera pendência', async () => {
    prisma.exercise.update.mockResolvedValue({ id: 'e1' });
    const r = await service.atualizar({ id: 'e1', hlsProcessed: true });
    expect(r.updated).toMatchObject({ id: 'e1' });
  });
});
