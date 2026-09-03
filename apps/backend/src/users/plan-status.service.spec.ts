import { SessionPayload } from '@/auth/session-payload';
import { PlanStatusService } from './plan-status.service';

function prismaMock() {
  return {
    partnerAccount: { findUnique: jest.fn() },
    partnerTier: { findFirst: jest.fn() },
    partnerSubscription: { findFirst: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

function sessao(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    id: 'u-1',
    name: null,
    email: null,
    image: null,
    roles: ['INDIVIDUAL'],
    systemRoles: ['USER'],
    isAdmin: false,
    subscriptionStatus: null,
    subscriptionPlan: null,
    stripeCustomerId: null,
    ...over,
  };
}

/**
 * Fatia 32 (lote 1) — RED. Plan-status: BOTH, admin, sem acesso.
 */
describe('PlanStatusService', () => {
  let prisma: PrismaMock;
  let service: PlanStatusService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new PlanStatusService(prisma as any);
    prisma.partnerAccount.findUnique.mockResolvedValue(null);
    prisma.partnerSubscription.findFirst.mockResolvedValue(null);
  });

  it('sem nada → sem acesso com upgradeUrl', async () => {
    const r = await service.get(sessao({ roles: ['PENDING'] }));
    expect(r).toMatchObject({ hasAccess: false, upgradeUrl: '/dashboard/billing' });
  });

  it('trainer com conta aprovada → PARTNER com acesso', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue({
      id: 'pa-1',
      status: 'approved',
      partnerTier: 'starter',
      chargesEnabled: true,
      payoutsEnabled: true,
      tier: { maxAthletes: 5, maxPlansPerMonth: 10, allowFlexibleDistribution: false },
    });
    const r = await service.get(sessao({ roles: ['PROFESSIONAL'] }));
    expect(r).toMatchObject({ hasAccess: true, userType: 'PARTNER' });
  });

  it('BOTH (trainer + client) mostra as duas abas', async () => {
    prisma.partnerAccount.findUnique.mockResolvedValue({
      id: 'pa-1',
      status: 'approved',
      partnerTier: 'starter',
      tier: { maxAthletes: null, maxPlansPerMonth: null, allowFlexibleDistribution: false },
    });
    prisma.partnerSubscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      status: 'active',
      offer: { name: 'Oferta', price: 100, partner: { user: { name: 'T', image: null } } },
      createdAt: new Date(),
    });
    const r = await service.get(sessao({ roles: ['PROFESSIONAL', 'CLIENT'] }));
    expect(r).toMatchObject({ hasAccess: true, userType: 'BOTH' });
    expect(r).toHaveProperty('partner');
    expect(r).toHaveProperty('client');
  });

  it('[controle] admin sem conta → ADMIN com acesso', async () => {
    const r = await service.get(sessao({ roles: ['INDIVIDUAL'], isAdmin: true }));
    expect(r).toMatchObject({ hasAccess: true, userType: 'ADMIN' });
  });
});
