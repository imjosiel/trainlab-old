import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminMetricsB2bService {
  constructor(private readonly prisma: PrismaService) {}
  async get() {
    const subs: any[] = await this.prisma.partnerSubscription.findMany({ where: { status: 'active' }, take: 5000, include: { offer: { include: { partner: { include: { user: { select: { name: true, image: true } } } } } } } });
    const valid = subs.filter((s) => s.offer && s.offer.partner);
    const totalGrossMrr = valid.reduce((a, s) => a + Number(s.offer.price ?? 0), 0);
    const totalPlatformMrr = valid.reduce((a, s) => a + Number(s.offer.price ?? 0) * Number(s.offer.partner.commissionRate ?? 0), 0);
    const stats: Record<string, any> = {};
    for (const sub of valid) {
      const pid = sub.offer.partner.id;
      if (!stats[pid]) stats[pid] = { id: pid, name: sub.offer.partner.user?.name ?? 'Usuário deletado', image: sub.offer.partner.user?.image ?? null, tier: sub.offer.partner.partnerTier, commissionRate: sub.offer.partner.commissionRate, activeStudents: 0, generatedRevenue: 0, platformFee: 0 };
      stats[pid].activeStudents += 1;
      stats[pid].generatedRevenue += Number(sub.offer.price ?? 0);
      stats[pid].platformFee += Number(sub.offer.price ?? 0) * Number(sub.offer.partner.commissionRate);
    }
    const topPartners = Object.values(stats).sort((a: any, b: any) => b.generatedRevenue - a.generatedRevenue).slice(0, 10).map((p: any) => ({ ...p, generatedRevenue: parseFloat(p.generatedRevenue.toFixed(2)), platformFee: parseFloat(p.platformFee.toFixed(2)) }));
    return { totalGrossMrr: parseFloat(totalGrossMrr.toFixed(2)), totalPlatformCutMrr: parseFloat(totalPlatformMrr.toFixed(2)), totalActiveB2BStudents: valid.length, topPartners };
  }
}
