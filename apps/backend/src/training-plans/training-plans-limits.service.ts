import { Injectable } from '@nestjs/common';

import {
  canCreatePlan,
  LimitCheckResult,
} from '@/common/subscription-limits';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Fatia 29 (D103) — fachada fina sobre a fonte única
 * `src/common/subscription-limits.ts`. Mantém a assinatura para os
 * chamadores (`TrainingPlansCreateService`) e specs existentes não mudarem.
 */
@Injectable()
export class TrainingPlansLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async canCreatePlan(
    userId: string,
    userPlan: string | null,
    isAdmin: boolean,
    studentId: string | null,
  ): Promise<{ allowed: boolean; message?: string }> {
    const check: LimitCheckResult = await canCreatePlan(
      this.prisma,
      userId,
      userPlan,
      isAdmin,
      studentId,
    );
    return check.allowed ? { allowed: true } : { allowed: false, message: check.message };
  }
}
