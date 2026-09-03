import { canAddAthlete, canCreatePlan, getEffectiveLimits } from './subscription-limits';

function prismaMock() {
  return {
    partnerAccount: { findUnique: jest.fn() },
    partnerTier: { findFirst: jest.fn() },
    saaSTier: { findFirst: jest.fn() },
    student: { count: jest.fn() },
    trainingPlan: { count: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof prismaMock>;

const USER = 'user-1';

/**
 * Fatia 29 (D101) — RED.
 *
 * Porte fiel de `lib/subscription-limits.ts`: prioridade
 * admin → partner → SaaS → free, `null` = ilimitado (sem count), pool
 * flexível pelo count real de alunos (BUG-30 fix do legado).
 */
describe('subscription-limits (fatia 29, D101)', () => {
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = prismaMock();
    prisma.student.count.mockResolvedValue(0);
    prisma.trainingPlan.count.mockResolvedValue(0);
  });

  describe('getEffectiveLimits — prioridade', () => {
    it('admin → ilimitado, sem tocar no banco', async () => {
      const r = await getEffectiveLimits(prisma as never, USER, { isAdmin: true });
      expect(r).toMatchObject({ type: 'admin', maxAthletes: null, maxPlansPerMonth: null });
      expect(prisma.partnerAccount.findUnique).not.toHaveBeenCalled();
    });

    it('parceiro com tier → limites do tier', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        status: 'approved',
        tier: { maxAthletes: 5, maxPlansPerMonth: 10, allowFlexibleDistribution: false },
      });
      const r = await getEffectiveLimits(prisma as never, USER, {});
      expect(r).toMatchObject({ type: 'partner', maxAthletes: 5, maxPlansPerMonth: 10 });
    });

    it('parceiro sem tier → fallback starter', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({ status: 'approved', tier: null });
      prisma.partnerTier.findFirst.mockResolvedValue({
        maxAthletes: 3,
        maxPlansPerMonth: 10,
        allowFlexibleDistribution: true,
      });
      const r = await getEffectiveLimits(prisma as never, USER, {});
      expect(prisma.partnerTier.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'starter', isActive: true } }),
      );
      expect(r).toMatchObject({ type: 'partner', maxAthletes: 3 });
    });

    it('parceiro nunca cai no fallback SaaS (sistemas independentes)', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        status: 'pending',
        tier: { maxAthletes: 1, maxPlansPerMonth: 5, allowFlexibleDistribution: false },
      });
      const r = await getEffectiveLimits(prisma as never, USER, { userPlan: 'premium' });
      expect(r.type).toBe('partner');
      expect(prisma.saaSTier.findFirst).not.toHaveBeenCalled();
    });

    it('SaaS premium → ilimitado', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      const r = await getEffectiveLimits(prisma as never, USER, { userPlan: 'premium' });
      expect(r).toMatchObject({ type: 'saas', maxAthletes: null, maxPlansPerMonth: null });
    });

    it('SaaS por nome de tier → limites do banco', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      prisma.saaSTier.findFirst.mockResolvedValue({ maxAthletes: 3, maxPlansPerMonth: 10 });
      const r = await getEffectiveLimits(prisma as never, USER, { userPlan: 'Base' });
      expect(r).toMatchObject({ type: 'saas', maxAthletes: 3, maxPlansPerMonth: 10 });
    });

    it('sem plano e sem parceiro → free (0 tudo)', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      const r = await getEffectiveLimits(prisma as never, USER, {});
      expect(r).toMatchObject({ type: 'free', maxAthletes: 0, maxPlansPerMonth: 0 });
    });
  });

  describe('canAddAthlete', () => {
    it('[controle] admin → permitido sem count', async () => {
      const r = await canAddAthlete(prisma as never, USER, null, true);
      expect(r.allowed).toBe(true);
      expect(prisma.student.count).not.toHaveBeenCalled();
    });

    it('ilimitado (null) → permitido sem count', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        status: 'approved',
        tier: { maxAthletes: null, maxPlansPerMonth: null, allowFlexibleDistribution: false },
      });
      const r = await canAddAthlete(prisma as never, USER, null, false);
      expect(r.allowed).toBe(true);
      expect(prisma.student.count).not.toHaveBeenCalled();
    });

    it('abaixo do limite → permitido com current', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        status: 'approved',
        tier: { maxAthletes: 5, maxPlansPerMonth: 10, allowFlexibleDistribution: false },
      });
      prisma.student.count.mockResolvedValue(4);
      const r = await canAddAthlete(prisma as never, USER, null, false);
      expect(r).toMatchObject({ allowed: true, current: 4, limit: 5 });
    });

    it('no limite → bloqueado com mensagem de parceiro', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        status: 'approved',
        tier: { maxAthletes: 5, maxPlansPerMonth: 10, allowFlexibleDistribution: false },
      });
      prisma.student.count.mockResolvedValue(5);
      const r = await canAddAthlete(prisma as never, USER, null, false);
      expect(r.allowed).toBe(false);
      expect(r.message).toContain('5 alunos');
    });

    it('SaaS ativo permite (não só parceiro)', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      prisma.saaSTier.findFirst.mockResolvedValue({ maxAthletes: 3, maxPlansPerMonth: 10 });
      prisma.student.count.mockResolvedValue(0);
      const r = await canAddAthlete(prisma as never, USER, 'Base', false);
      expect(r.allowed).toBe(true);
    });

    it('free bloqueia com mensagem SaaS', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      const r = await canAddAthlete(prisma as never, USER, null, false);
      expect(r.allowed).toBe(false);
      expect(r.message).toContain('Premium');
    });
  });

  describe('canCreatePlan', () => {
    it('[controle] admin → permitido', async () => {
      const r = await canCreatePlan(prisma as never, USER, null, true, null);
      expect(r.allowed).toBe(true);
    });

    it('pool flexível: multiplica pelo count real de alunos', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        status: 'approved',
        tier: { maxAthletes: null, maxPlansPerMonth: 10, allowFlexibleDistribution: true },
      });
      prisma.student.count.mockResolvedValue(3);
      prisma.trainingPlan.count.mockResolvedValue(29);
      const r = await canCreatePlan(prisma as never, USER, null, false, null);
      expect(r).toMatchObject({ allowed: true, limit: 30, mode: 'flexible' });
    });

    it('pool flexível estourado → bloqueado', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        status: 'approved',
        tier: { maxAthletes: null, maxPlansPerMonth: 10, allowFlexibleDistribution: true },
      });
      prisma.student.count.mockResolvedValue(2);
      prisma.trainingPlan.count.mockResolvedValue(20);
      const r = await canCreatePlan(prisma as never, USER, null, false, null);
      expect(r.allowed).toBe(false);
      expect(r.message).toContain('20 planos');
    });

    it('parceiro por aluno (studentId) → limite per_student', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue({
        status: 'approved',
        tier: { maxAthletes: null, maxPlansPerMonth: 10, allowFlexibleDistribution: false },
      });
      prisma.trainingPlan.count.mockResolvedValue(10);
      const r = await canCreatePlan(prisma as never, USER, null, false, 'stu-1');
      expect(r).toMatchObject({ allowed: false, mode: 'per_student' });
    });

    it('free → bloqueado (texto do legado: limite de 0 planos)', async () => {
      prisma.partnerAccount.findUnique.mockResolvedValue(null);
      const r = await canCreatePlan(prisma as never, USER, null, false, null);
      expect(r.allowed).toBe(false);
      expect(r.message).toContain('Limite de 0 planos por mês atingido');
    });
  });
});
