import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class TrainingPlansLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async canCreatePlan(userId: string, userPlan: string | null, isAdmin: boolean, studentId: string | null): Promise<{ allowed: boolean; message?: string }> {
    if (isAdmin) return { allowed: true };
    // B2B check
    const partnerAccount: any = await this.prisma.partnerAccount.findUnique({ where: { userId }, select: { status: true, tier: { select: { maxPlansPerMonth: true, allowFlexibleDistribution: true } } } }).catch(() => null);
    if (partnerAccount) {
      const max = partnerAccount.tier?.maxPlansPerMonth ?? 10;
      if (max === null) return { allowed: true };
      const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
      if (partnerAccount.tier?.allowFlexibleDistribution) {
        const studentCount = await this.prisma.student.count({ where: { trainerId: userId } });
        const pool = max * Math.max(studentCount, 1);
        const total = await this.prisma.trainingPlan.count({ where: { trainerId: userId, createdAt: { gte: start } } });
        if (total >= pool) return { allowed: false, message: `Limite do pool flexível atingido: ${pool} planos/mês.` };
        return { allowed: true };
      }
      if (studentId) {
        const cnt = await this.prisma.trainingPlan.count({ where: { trainerId: userId, studentId, createdAt: { gte: start } } });
        if (cnt >= max) return { allowed: false, message: `Limite de ${max} planos por aluno/mês atingido.` };
        return { allowed: true };
      }
      const total = await this.prisma.trainingPlan.count({ where: { trainerId: userId, createdAt: { gte: start } } });
      const sc = await this.prisma.student.count({ where: { trainerId: userId } });
      const global = max * Math.max(sc, 1);
      if (total >= global) return { allowed: false, message: `Limite global mensal atingido (${global} planos).` };
      return { allowed: true };
    }
    // SaaS
    if (userPlan) {
      const tier: any = await this.prisma.saaSTier.findFirst({ where: { name: { equals: userPlan, mode: 'insensitive' }, isActive: true }, select: { maxPlansPerMonth: true } }).catch(() => null);
      const max = tier?.maxPlansPerMonth ?? (userPlan.toLowerCase() === 'premium' ? null : 10);
      if (max === null) return { allowed: true };
      const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
      const cnt = await this.prisma.trainingPlan.count({ where: { trainerId: userId, createdAt: { gte: start } } });
      if (cnt >= max) return { allowed: false, message: `Limite de ${max} planos por mês atingido.` };
      return { allowed: true };
    }
    return { allowed: false, message: 'Você precisa de uma assinatura ativa para criar planos.' };
  }
}
