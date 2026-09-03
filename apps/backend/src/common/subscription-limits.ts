/**
 * Porte fiel de `lib/subscription-limits.ts` do legado (fatia 29, D101).
 *
 * Fonte única de verdade para limites de usuário. Prioridade:
 *   1. Admin → ilimitado
 *   2. Parceiro B2B (qualquer status) → sistema parceiro (PartnerTier)
 *   3. Treinador SaaS → sistema SaaS (SaaSTier)
 *   4. Sem plano (free) → 0 tudo
 *
 * B2B e SaaS são SISTEMAS INDEPENDENTES. Parceiro com qualquer status nunca
 * cai no fallback SaaS.
 *
 * Diferença assumida do legado: o Prisma chega por injeção (primeiro
 * parâmetro) em vez de singleton importado — sem isso não dá para mockar
 * sem módulo, e todo spec deste arquivo mocka.
 */

import { PrismaService } from '@/prisma/prisma.service';

// ─── Fallbacks hardcoded (último recurso) ─────────────────────────────────────
export const PLAN_LIMITS = {
  base: { maxAthletes: 3, maxPlansPerMonth: 10 },
  premium: { maxAthletes: null, maxPlansPerMonth: null }, // ilimitado
} as const;

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export type LimitsType = 'admin' | 'partner' | 'saas' | 'free';

export interface EffectiveLimits {
  type: LimitsType;
  partnerStatus?: string;
  maxAthletes: number | null;
  maxPlansPerMonth: number | null;
  allowFlexibleDistribution: boolean;
}

export interface LimitCheckResult {
  allowed: boolean;
  current?: number;
  limit?: number | null;
  message?: string;
  mode?: 'flexible' | 'per_student';
}

// ─── getEffectiveLimits ───────────────────────────────────────────────────────

export async function getEffectiveLimits(
  prisma: PrismaService,
  userId: string,
  { isAdmin = false, userPlan = null as string | null } = {},
): Promise<EffectiveLimits> {
  // 1. Admin
  if (isAdmin) {
    return {
      type: 'admin',
      maxAthletes: null,
      maxPlansPerMonth: null,
      allowFlexibleDistribution: false,
    };
  }

  // 2. Parceiro B2B
  const partnerAccount = (await prisma.partnerAccount
    .findUnique({
      where: { userId },
      select: {
        status: true,
        tier: {
          select: { maxAthletes: true, maxPlansPerMonth: true, allowFlexibleDistribution: true },
        },
      },
    })
    .catch(() => null)) as {
    status: string;
    tier: { maxAthletes: number | null; maxPlansPerMonth: number | null; allowFlexibleDistribution: boolean | null } | null;
  } | null;

  if (partnerAccount) {
    if (partnerAccount.tier) {
      return {
        type: 'partner',
        partnerStatus: partnerAccount.status,
        maxAthletes: partnerAccount.tier.maxAthletes,
        maxPlansPerMonth: partnerAccount.tier.maxPlansPerMonth,
        allowFlexibleDistribution: partnerAccount.tier.allowFlexibleDistribution ?? false,
      };
    }

    // Parceiro sem tier → fallback Starter
    const starterTier = (await prisma.partnerTier
      .findFirst({
        where: { slug: 'starter', isActive: true },
        select: { maxAthletes: true, maxPlansPerMonth: true, allowFlexibleDistribution: true },
      })
      .catch(() => null)) as {
      maxAthletes: number | null;
      maxPlansPerMonth: number | null;
      allowFlexibleDistribution: boolean | null;
    } | null;

    return {
      type: 'partner',
      partnerStatus: partnerAccount.status,
      maxAthletes: starterTier?.maxAthletes ?? null,
      maxPlansPerMonth: starterTier?.maxPlansPerMonth ?? 10,
      allowFlexibleDistribution: starterTier?.allowFlexibleDistribution ?? false,
    };
  }

  // 3. SaaS
  if (userPlan) {
    const normalized = userPlan.toLowerCase();
    if (normalized === 'premium') {
      return { type: 'saas', maxAthletes: null, maxPlansPerMonth: null, allowFlexibleDistribution: false };
    }
    try {
      const saasTier = (await prisma.saaSTier.findFirst({
        where: { name: { equals: normalized, mode: 'insensitive' }, isActive: true },
        select: { maxAthletes: true, maxPlansPerMonth: true },
      })) as { maxAthletes: number | null; maxPlansPerMonth: number | null } | null;
      if (saasTier) {
        return {
          type: 'saas',
          maxAthletes: saasTier.maxAthletes,
          maxPlansPerMonth: saasTier.maxPlansPerMonth,
          allowFlexibleDistribution: false,
        };
      }
    } catch (err) {
      console.error(`[LIMITS_DB_ERROR] Erro ao buscar SaaSTier '${userPlan}':`, err);
    }
    const fallback = PLAN_LIMITS[normalized as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.base;
    return { type: 'saas', ...fallback, allowFlexibleDistribution: false };
  }

  // 4. Free
  return { type: 'free', maxAthletes: 0, maxPlansPerMonth: 0, allowFlexibleDistribution: false };
}

// ─── canAddAthlete ────────────────────────────────────────────────────────────

export async function canAddAthlete(
  prisma: PrismaService,
  userId: string,
  userPlan: string | null,
  isAdmin = false,
): Promise<LimitCheckResult> {
  const limits = await getEffectiveLimits(prisma, userId, { isAdmin, userPlan });
  if (limits.maxAthletes === null) return { allowed: true, limit: null };

  const athleteCount = await prisma.student.count({ where: { trainerId: userId } });

  if (athleteCount >= limits.maxAthletes) {
    const isPartner = limits.type === 'partner';
    return {
      allowed: false,
      message: isPartner
        ? `Limite de ${limits.maxAthletes} alunos atingido para o seu plano de parceiro.`
        : `Limite de ${limits.maxAthletes} atletas atingido. Faça upgrade para o plano Premium.`,
      current: athleteCount,
      limit: limits.maxAthletes,
    };
  }

  return { allowed: true, current: athleteCount, limit: limits.maxAthletes };
}

// ─── canCreatePlan ────────────────────────────────────────────────────────────

export async function canCreatePlan(
  prisma: PrismaService,
  userId: string,
  userPlan: string | null,
  isAdmin = false,
  studentId: string | null = null,
): Promise<LimitCheckResult> {
  const limits = await getEffectiveLimits(prisma, userId, { isAdmin, userPlan });
  if (limits.maxPlansPerMonth === null) return { allowed: true, limit: null };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Pool flexível (parceiro B2B com allowFlexibleDistribution)
  if (limits.allowFlexibleDistribution) {
    const studentCount = await prisma.student.count({ where: { trainerId: userId } });
    const poolLimit = limits.maxPlansPerMonth * Math.max(studentCount, 1);
    const totalThisMonth = await prisma.trainingPlan.count({
      where: { trainerId: userId, createdAt: { gte: startOfMonth } },
    });
    if (totalThisMonth >= poolLimit) {
      return {
        allowed: false,
        message: `Limite do pool flexível atingido: ${poolLimit} planos/mês (${limits.maxPlansPerMonth} × ${studentCount} alunos).`,
        current: totalThisMonth,
        limit: poolLimit,
        mode: 'flexible',
      };
    }
    return { allowed: true, current: totalThisMonth, limit: poolLimit, mode: 'flexible' };
  }

  // Parceiro B2B — limite por aluno (studentId)
  if (limits.type === 'partner') {
    if (studentId) {
      const plansForStudent = await prisma.trainingPlan.count({
        where: { trainerId: userId, studentId, createdAt: { gte: startOfMonth } },
      });
      if (plansForStudent >= limits.maxPlansPerMonth) {
        return {
          allowed: false,
          message: `Limite de ${limits.maxPlansPerMonth} planos por aluno/mês atingido para este aluno.`,
          current: plansForStudent,
          limit: limits.maxPlansPerMonth,
          mode: 'per_student',
        };
      }
      return { allowed: true, current: plansForStudent, limit: limits.maxPlansPerMonth, mode: 'per_student' };
    }

    // athleteId ou contexto sem studentId — limite global mensal pelo count
    // real de alunos (BUG-30 fix: o ×10 hardcoded era impreciso).
    const realStudentCount = await prisma.student.count({ where: { trainerId: userId } });
    const globalMonthlyLimit = limits.maxPlansPerMonth * Math.max(realStudentCount, 1);
    const total = await prisma.trainingPlan.count({
      where: { trainerId: userId, createdAt: { gte: startOfMonth } },
    });
    if (total >= globalMonthlyLimit) {
      return {
        allowed: false,
        message: `Limite global mensal atingido (${globalMonthlyLimit} planos).`,
        current: total,
        limit: globalMonthlyLimit,
        mode: 'per_student',
      };
    }
    return { allowed: true, current: total, limit: globalMonthlyLimit, mode: 'per_student' };
  }

  // SaaS / free — limite global mensal
  const plansThisMonth = await prisma.trainingPlan.count({
    where: { trainerId: userId, createdAt: { gte: startOfMonth } },
  });
  if (plansThisMonth >= limits.maxPlansPerMonth) {
    return {
      allowed: false,
      message: `Limite de ${limits.maxPlansPerMonth} planos por mês atingido. Faça upgrade para o plano Premium.`,
      current: plansThisMonth,
      limit: limits.maxPlansPerMonth,
    };
  }
  return { allowed: true, current: plansThisMonth, limit: limits.maxPlansPerMonth };
}
