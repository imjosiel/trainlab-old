import { HttpException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { UploadImageService } from './upload-image.service';

function prismaMock() {
  return { partnerAccount: { findUnique: jest.fn() } };
}

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: 'trainer-1',
    name: 'T',
    email: 't@e.c',
    image: null,
    roles: ['PROFESSIONAL'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: 'active',
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

function arquivo(over: Record<string, unknown> = {}) {
  return { mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x'), ...over };
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
 * Fatia 34 (lote 2b) — RED. Upload de imagem: gate + validação.
 * O PutObject em si fica para e2e (D116: S3Client é instanciado no método).
 */
describe('UploadImageService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: UploadImageService;
  let r2: Record<string, string | undefined>;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new UploadImageService(prisma as any);
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
    const body = await bodyOfRejection(
      service.upload(sessao({ roles: ['INDIVIDUAL'] }), arquivo()),
    );
    expect(body).toEqual({ error: 'Apenas treinadores podem fazer upload.' });
  });

  it('sem parceiro aprovado nem assinatura → 403', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'pending' });
    const body = await bodyOfRejection(
      service.upload(sessao({ subscriptionStatus: 'inactive' }), arquivo()),
    );
    expect(body).toEqual({ error: 'Assinatura inativa.' });
  });

  it('R2 ausente → 503 antes de qualquer client', async () => {
    delete process.env.R2_ACCOUNT_ID;
    prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
    try {
      await service.upload(sessao(), arquivo());
      throw new Error('esperava 503, mas resolveu');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(503);
      expect((err as HttpException).getResponse()).toEqual({ error: 'R2 não configurado.' });
    }
  });

  it('tipo fora da lista → 403', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
    const body = await bodyOfRejection(service.upload(sessao(), arquivo({ mimetype: 'application/pdf' })));
    expect(body).toEqual({ error: 'Tipo de arquivo não permitido.' });
  });

  it('acima de 5MB → 403', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved' });
    const body = await bodyOfRejection(
      service.upload(sessao(), arquivo({ size: 6 * 1024 * 1024 })),
    );
    expect(body).toEqual({ error: 'Imagem muito grande. Máximo 5MB.' });
  });
});
