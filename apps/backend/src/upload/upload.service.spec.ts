import { HttpException } from '@nestjs/common';

import { UploadService } from './upload.service';

function prismaMock() {
  return { partnerAccount: { findUnique: jest.fn() } };
}

function sessao(over: Record<string, unknown> = {}) {
  return {
    id: 'trainer-1',
    roles: ['PROFESSIONAL'],
    isAdmin: false,
    subscriptionStatus: 'active',
    ...over,
  } as never;
}

function arquivo(over: Record<string, unknown> = {}) {
  return { field: 'manifest', name: 'master.m3u8', type: 'application/x-mpegURL', ...over };
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

/**
 * Fatia 35 (lote 2c) — RED. Presign R2: gate + tetos (sem rede — D116).
 */
describe('UploadService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;
  let r2: Record<string, string | undefined>;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new UploadService(prisma as any);
    prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
    r2 = {
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    };
    process.env.R2_ACCOUNT_ID = 'acc';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET_NAME = 'bucket';
  });

  afterEach(() => {
    Object.assign(process.env, r2);
  });

  it('não-treinador → 403', async () => {
    const body = await bodyOfRejection(service.presign(sessao({ roles: ['INDIVIDUAL'] }), { files: [arquivo()] }));
    expect(body).toEqual({ error: 'Apenas treinadores podem fazer upload' });
  });

  it('R2 ausente → 503', async () => {
    delete process.env.R2_ACCOUNT_ID;
    try {
      await service.presign(sessao(), { files: [arquivo()] });
      throw new Error('esperava 503');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(503);
      expect((err as HttpException).getResponse()).toEqual({ error: 'R2 não configurado' });
    }
  });

  it('lista vazia → 403', async () => {
    const body = await bodyOfRejection(service.presign(sessao(), { files: [] }));
    expect(body).toEqual({ error: 'Lista de arquivos ausente.' });
  });

  it('21 arquivos → 403', async () => {
    const body = await bodyOfRejection(
      service.presign(sessao(), { files: Array.from({ length: 21 }, () => arquivo()) }),
    );
    expect(body).toEqual({ error: 'Máximo de 20 arquivos por batch.' });
  });

  it('tipo fora da lista → 403', async () => {
    const body = await bodyOfRejection(
      service.presign(sessao(), { files: [arquivo({ type: 'application/pdf' })] }),
    );
    expect(body).toEqual({ error: expect.stringMatching(/não permitido/i) });
  });
});
