import { PartnerTierVerifyService } from './partner-tier-verify.service';

jest.mock('stripe');

function prismaMock() {
  return {
    partnerAccount: { findUnique: jest.fn(), update: jest.fn() },
    partnerTier: { findUnique: jest.fn() },
    partnerTierRequest: { create: jest.fn() },
    $transaction: jest.fn((ops: unknown) => Promise.resolve(ops)),
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function sessao() {
  return { id: 'user-1' } as never;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let retrieveMock: jest.Mock;

async function makeService(prisma: PrismaMock) {
  const Stripe = (await import('stripe')).default;
  retrieveMock = jest.fn();
  (Stripe as unknown as jest.Mock).mockImplementation(() => ({
    checkout: { sessions: { retrieve: retrieveMock } },
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PartnerTierVerifyService(prisma as any);
}

/**
 * Fatia 32 (lote 1) — RED. Tier-verify (fallback do webhook).
 * Stripe mockado por módulo (D112).
 */
describe('PartnerTierVerifyService', () => {
  let prisma: PrismaMock;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = prismaMock();
  });

  it('tipo errado ou unpaid → updated false', async () => {
    const service = await makeService(prisma);
    retrieveMock.mockResolvedValue({ metadata: { type: 'outro' }, payment_status: 'paid' });
    const r = await service.verificar(sessao(), 'cs_1');
    expect(r).toMatchObject({ updated: false });
    expect(prisma.partnerAccount.findUnique).not.toHaveBeenCalled();
  });

  it('metadata incompleto → updated false', async () => {
    const service = await makeService(prisma);
    retrieveMock.mockResolvedValue({
      metadata: { type: 'partner_tier_payment' },
      payment_status: 'paid',
    });
    const r = await service.verificar(sessao(), 'cs_1');
    expect(r).toMatchObject({ updated: false });
  });

  it('conta de outro usuário → error', async () => {
    const service = await makeService(prisma);
    retrieveMock.mockResolvedValue({
      metadata: { type: 'partner_tier_payment', partnerId: 'pa-1', toTierId: 't1', toTierSlug: 'pro' },
      payment_status: 'paid',
    });
    prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', userId: 'outro', tierId: 't0' });
    const r = await service.verificar(sessao(), 'cs_1');
    expect(r).toHaveProperty('error');
  });

  it('já no tier → alreadyCurrent', async () => {
    const service = await makeService(prisma);
    retrieveMock.mockResolvedValue({
      metadata: { type: 'partner_tier_payment', partnerId: 'pa-1', toTierId: 't1', toTierSlug: 'pro' },
      payment_status: 'paid',
    });
    prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', userId: 'user-1', tierId: 't1' });
    prisma.partnerTier.findUnique.mockResolvedValue({ id: 't1', slug: 'pro', name: 'Pro', commissionRate: 0.3 });
    const r = await service.verificar(sessao(), 'cs_1');
    expect(r).toMatchObject({ updated: false, alreadyCurrent: true });
  });

  it('[controle] caminho feliz atualiza e registra audit trail', async () => {
    const service = await makeService(prisma);
    retrieveMock.mockResolvedValue({
      metadata: { type: 'partner_tier_payment', partnerId: 'pa-1', toTierId: 't1', toTierSlug: 'pro', fromTierId: 't0' },
      payment_status: 'paid',
    });
    prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1', userId: 'user-1', tierId: 't0' });
    prisma.partnerTier.findUnique.mockResolvedValue({ id: 't1', slug: 'pro', name: 'Pro', commissionRate: 0.3 });
    const r = await service.verificar(sessao(), 'cs_1');
    expect(r).toMatchObject({ updated: true, tierName: 'Pro' });
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
