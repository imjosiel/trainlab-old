import { HttpException } from '@nestjs/common';

import { PartnerSettingsService } from './partner-settings.service';

function prismaMock() {
  return {
    partnerAccount: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    partnerTier: { findFirst: jest.fn() },
    user: { update: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
  };
}

function sessao(over: Record<string, unknown> = {}) {
  return { id: 'u-1', roles: ['PARTNER_B2B'], isAdmin: false, ...over } as never;
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
 * Fatia 34 (lote 2b) — RED. Partner-settings: só allowTestMode é escrito.
 */
describe('PartnerSettingsService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: PartnerSettingsService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new PartnerSettingsService(prisma as any);
  });

  it('não-parceiro, sem admin → 404', async () => {
    const body = await bodyOfRejection(
      service.update(sessao({ roles: ['INDIVIDUAL'] }), { allowTestMode: true }),
    );
    expect(body).toEqual({ error: 'Acesso restrito a parceiros.' });
  });

  it('sem conta → 404', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue(null);
    const body = await bodyOfRejection(service.update(sessao(), { allowTestMode: true }));
    expect(body).toEqual({ error: 'Conta de parceiro não encontrada.' });
  });

  it('[controle] escreve só allowTestMode, nada além', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue({ id: 'pa-1' });
    prisma.partnerAccount.update.mockResolvedValue({ id: 'pa-1', allowTestMode: true });
    await service.update(sessao(), { allowTestMode: true, commissionRate: 0.99 } as never);
    expect(prisma.partnerAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { allowTestMode: true } }),
    );
  });
});
