import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminOverviewService {
  constructor(private readonly prisma: PrismaService) {}
  async get() {
    const [totalUsers, totalTrainers, totalAthletes, totalPlans, activeSubCount, recentUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { roles: { has: 'PROFESSIONAL' } } }),
      this.prisma.user.count({ where: { OR: [{ roles: { hasSome: ['INDIVIDUAL','CLIENT','PENDING'] } }, { roles: { isEmpty: true } }] } }),
      this.prisma.trainingPlan.count(),
      this.prisma.userSubscription.count({ where: { status: 'active' } }),
      this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, email: true, roles: true, createdAt: true } }),
    ]);
    const activeTiers: any[] = await this.prisma.saaSTier.findMany({ where: { isActive: true }, select: { name: true, price: true } });
    const tierPriceMap = new Map(activeTiers.map((t: any) => [String(t.name).toLowerCase(), Number(t.price)]));
    const subsGrouped: any[] = await (this.prisma.userSubscription as any).groupBy({ by: ['plan'], where: { status: 'active' }, _count: { id: true } });
    let estimatedMrr = 0;
    for (const row of subsGrouped) {
      const count = Number((row._count as any).id);
      const price = tierPriceMap.get(String(row.plan ?? '').toLowerCase());
      if (price !== undefined && !isNaN(price)) estimatedMrr += price * count;
    }
    return { stats: { totalUsers, totalTrainers, totalAthletes, totalPlans, activeSubscriptions: activeSubCount, estimatedMrr }, recentUsers };
  }
}
