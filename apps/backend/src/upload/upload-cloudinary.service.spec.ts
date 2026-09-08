import { HttpException } from '@nestjs/common';

import { UploadCloudinaryService } from './upload-cloudinary.service';

function prismaMock() {
  return { partnerAccount: { findUnique: jest.fn() } };
}

function sessao(over: Record<string, unknown> = {}) {
  return {
    id: 'trainer-1',
    roles: ['PROFESSIONAL'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: 'active',
    ...over,
  } as never;
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
 * Fatia 34 (lote 2b) — RED. Assinatura Cloudinary: gate + HMAC local.
 */
describe('UploadCloudinaryService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: UploadCloudinaryService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new UploadCloudinaryService(prisma as any);
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';
  });

  it('sem id → 401', async () => {
    const body = await bodyOfRejection(service.getSignature({} as never));
    expect(body).toEqual({ error: 'Não autenticado.' });
  });

  it('não-treinador → 403', async () => {
    const body = await bodyOfRejection(service.getSignature(sessao({ roles: ['INDIVIDUAL'] })));
    expect(body).toEqual({ error: 'Apenas treinadores podem fazer upload.' });
  });

  it('sem parceiro nem assinatura → 403', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'pending' });
    const body = await bodyOfRejection(service.getSignature(sessao({ subscriptionStatus: 'inactive' })));
    expect(body).toEqual({ error: expect.stringMatching(/parceiro aprovado|assinatura ativa/i) });
  });

  it('[controle] admin passa sem conta e assinatura não vaza o secret', async () => {
    const r = await service.getSignature(sessao({ isAdmin: true }));
    expect(r).toMatchObject({ folder: 'player_action_b2b_exercises' });
    expect(JSON.stringify(r)).not.toContain('secret');
    expect(r.timestamp).toBeGreaterThan(0);
  });
});
