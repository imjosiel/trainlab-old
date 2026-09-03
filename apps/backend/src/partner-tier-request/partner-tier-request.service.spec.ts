import { HttpException } from '@nestjs/common';

import { PartnerTierRequestService } from './partner-tier-request.service';

function prismaMock() {
  return {
    partnerAccount: { findUnique: jest.fn(), update: jest.fn() },
    partnerTier: { findFirst: jest.fn() },
    partnerSubscription: { count: jest.fn() },
    userSubscription: { findUnique: jest.fn(), upsert: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
    partnerTierRequest: { findFirst: jest.fn(), create: jest.fn() },
    student: { count: jest.fn() },
    $transaction: jest.fn((ops: unknown) => Promise.resolve(ops)),
  };
}

function sessao() {
  return { id: 'u-1', email: 'u@e.c', name: 'U' } as never;
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

function conta(over: Record<string, unknown> = {}) {
  return { id: 'pa-1', tierId: 't0', partnerTier: 'starter', status: 'approved', ...over };
}

function tier(over: Record<string, unknown> = {}) {
  return { id: 't1', slug: 'pro', name: 'Pro', price: 0, commissionRate: 0.3, maxAthletes: null, ...over };
}

/**
 * Fatia 35 (lote 2c) — RED. Tier-request gratuito (sem Stripe): get + post.
 */
describe('PartnerTierRequestService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new PartnerTierRequestService(prisma as any);
    prisma.partnerAccount.findUnique.mockResolvedValue(conta());
    prisma.partnerTier.findFirst.mockResolvedValue(tier());
    prisma.systemSettings.findFirst.mockResolvedValue({ autoApproveTierChange: false });
    prisma.partnerTierRequest.findFirst.mockResolvedValue(null);
    prisma.partnerSubscription.count.mockResolvedValue(0);
    prisma.student.count.mockResolvedValue(0);
  });

  it('sem toTierId → 400', async () => {
    const body = await bodyOfRejection(service.post(sessao(), {}));
    expect(body).toEqual({ error: 'Tier de destino não informado.' });
  });

  it('sem conta → 404', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue(null);
    const body = await bodyOfRejection(service.post(sessao(), { toTierId: 't1' }));
    expect(body).toEqual({ error: 'Conta de parceiro não encontrada.' });
  });

  it('conta não aprovada → 403', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue(conta({ status: 'pending' }));
    const body = await bodyOfRejection(service.post(sessao(), { toTierId: 't1' }));
    expect(body).toEqual({ error: expect.stringMatching(/aprovada/i) });
  });

  it('já no tier → 400', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue(conta({ tierId: 't1', partnerTier: 'pro' }));
    const body = await bodyOfRejection(service.post(sessao(), { toTierId: 't1' }));
    expect(body).toEqual({ error: expect.stringMatching(/já está/i) });
  });

  it('duplicado pendente → 400', async () => {
    prisma.partnerTierRequest.findFirst.mockResolvedValue({ id: 'req-1' });
    const body = await bodyOfRejection(service.post(sessao(), { toTierId: 't1' }));
    expect(body).toEqual({ error: 'Você já possui uma solicitação pendente.' });
  });

  it('[controle] manual cria pendente', async () => {
    const r = await service.post(sessao(), { toTierId: 't1' });
    expect(r).toMatchObject({ success: true, immediate: false });
    expect(prisma.partnerTierRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) }),
    );
  });

  it('[controle] auto-approve transaciona', async () => {
    prisma.systemSettings.findFirst.mockResolvedValue({ autoApproveTierChange: true });
    const r = await service.post(sessao(), { toTierId: 't1' });
    expect(r).toMatchObject({ success: true, immediate: true });
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
