import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
@Injectable()
export class PartnerMetricsService {
  constructor(private readonly prisma: PrismaService) {}
  async get(user: SessionPayload) {
    const pa: any = await this.prisma.partnerAccount.findUnique({ where: { userId: user.id }, include: { offers: true, tier: true } });
    if (!user.isAdmin && (!pa || pa.status !== 'approved')) throw new ForbiddenException({ error: 'Conta de parceiro inválida ou não aprovada.' });
    if (!pa) return { grossMrr: 0, netMrr: 0, activeStudentsCount: 0, commissionRate: 0.50, tier: 'Administrador', payoutsEnabled: false, chargesEnabled: false, stripeAccountId: null };
    const effectiveCommissionRate = pa.customCommissionRate !== null ? pa.customCommissionRate : (pa.tier?.commissionRate ?? pa.commissionRate ?? 0.50);
    const effectiveTierName = pa.tier?.name ?? 'Starter';
    const subs: any[] = await this.prisma.partnerSubscription.findMany({ where: { offer: { partnerId: pa.id }, status: { in: ['active','canceling','trialing','past_due'] } }, take: 500, select: { id: true, offer: { select: { price: true, hourlyRate: true } } } });
    const valid = subs.filter((s) => s.offer);
    const grossMrr = valid.reduce((acc, s) => acc + Number(s.offer.price ?? 0) + Number((s.offer as any).hourlyRate ?? 0), 0);
    const netMrr = grossMrr * (1 - effectiveCommissionRate);
    return { grossMrr: parseFloat(grossMrr.toFixed(2)), netMrr: parseFloat(netMrr.toFixed(2)), activeStudentsCount: valid.length, commissionRate: effectiveCommissionRate, tier: effectiveTierName, payoutsEnabled: pa.payoutsEnabled ?? false, chargesEnabled: pa.chargesEnabled ?? false, stripeAccountId: pa.stripeAccountId ?? null };
  }
}
