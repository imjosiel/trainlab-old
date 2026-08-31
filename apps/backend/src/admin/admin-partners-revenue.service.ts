import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminPartnersRevenueService {
  constructor(private readonly prisma: PrismaService) {}
  async get() {
    const [totalPartners, approvedPartners, totalSubscriptions, activeSubscriptions, topPartners, saasActive] = await Promise.all([
      this.prisma.partnerAccount.count(),
      this.prisma.partnerAccount.count({ where: { status: 'approved' } }),
      this.prisma.partnerSubscription.count(),
      this.prisma.partnerSubscription.count({ where: { status: 'active' } }),
      this.prisma.partnerAccount.findMany({ where: { status: 'approved' }, take: 10, include: { user: { select: { name: true, email: true, image: true } }, offers: { include: { subscriptions: { where: { status: 'active' }, select: { id: true } } } } } }),
      this.prisma.userSubscription.count({ where: { status: 'active' } }),
    ]);
    const enriched = (topPartners as any[]).map((p: any) => {
      const totalRevenue = p.offers.reduce((acc: number, offer: any) => acc + offer.subscriptions.length * Number(offer.price), 0);
      const platformRevenue = parseFloat((totalRevenue * p.commissionRate).toFixed(2));
      const activeStudents = p.offers.reduce((acc: number, o: any) => acc + o.subscriptions.length, 0);
      return { ...p, totalRevenue: parseFloat(totalRevenue.toFixed(2)), platformRevenue, activeStudents };
    }).sort((a: any, b: any) => b.platformRevenue - a.platformRevenue);
    const totalB2BPlatformMRR = enriched.reduce((acc: number, p: any) => acc + p.platformRevenue, 0);
    return { overview: { totalPartners, approvedPartners, totalSubscriptions, activeSubscriptions, b2bPlatformMRR: totalB2BPlatformMRR, saasActiveUsers: saasActive }, topPartners: enriched };
  }
}
