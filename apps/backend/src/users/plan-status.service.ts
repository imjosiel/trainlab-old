import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
@Injectable()
export class PlanStatusService {
  constructor(private readonly prisma: PrismaService) {}
  async get(user: SessionPayload) {
    const userId = user.id;
    const isAdmin = !!user.isAdmin;
    const isTrainer = (user.roles ?? []).includes('PROFESSIONAL');
    const isClient = (user.roles ?? []).includes('CLIENT') || (user.roles ?? []).includes('INDIVIDUAL');
    const result: any = { hasAccess: false };
    // Partner (treinador) — sempre retorna se for trainer/admin com conta
    if (isTrainer || isAdmin) {
      const pa: any = await this.prisma.partnerAccount.findUnique({ where: { userId }, select: { id: true, status: true, partnerTier: true, chargesEnabled: true, payoutsEnabled: true, allowTestMode: true, tier: { select: { id: true, slug: true, name: true, description: true, price: true, commissionRate: true, minPrice: true, maxAthletes: true, maxPlansPerMonth: true, allowFlexibleDistribution: true } } } });
      if (pa) {
        const tierLimits = pa.tier ? { maxAthletes: pa.tier.maxAthletes, maxPlansPerMonth: pa.tier.maxPlansPerMonth, allowFlexibleDistribution: pa.tier.allowFlexibleDistribution } : await this.getTierLimits(pa.partnerTier ?? 'starter');
        result.partner = { userType: 'PARTNER', partnerStatus: isAdmin ? 'approved' : pa.status, isApproved: pa.status === 'approved' || isAdmin, tier: { slug: pa.tier?.slug ?? pa.partnerTier ?? 'starter', name: pa.tier?.name ?? (isAdmin ? 'Administrador' : 'Starter'), description: pa.tier?.description ?? 'Plano base', price: (pa.tier as any)?.price ?? 0, commissionRate: pa.tier?.commissionRate ?? 0.50, maxAthletes: tierLimits.maxAthletes, maxPlansPerMonth: tierLimits.maxPlansPerMonth, allowFlexibleDistribution: tierLimits.allowFlexibleDistribution ?? false }, stripeSetup: { chargesEnabled: pa.chargesEnabled, payoutsEnabled: pa.payoutsEnabled }, canUpgrade: false, hasAccess: pa.status === 'approved' || isAdmin };
        result.hasAccess = true;
        result.userType = 'PARTNER';
      } else if (isAdmin) {
        result.partner = { userType: 'ADMIN', hasAccess: true, tier: { slug: 'admin', name: 'Administrador', price: 0, maxAthletes: null, maxPlansPerMonth: null } };
        result.hasAccess = true;
        result.userType = 'ADMIN';
      }
    }
    // Client (aluno) — busca mesmo se já for trainer, para BOTH mostrar as duas abas
    const activeSub: any = await this.prisma.partnerSubscription.findFirst({ where: { userId, status: { in: ['active','canceling','trialing','past_due'] } }, include: { offer: { select: { name: true, price: true, partner: { select: { user: { select: { name: true, image: true } } } } } } }, orderBy: { createdAt: 'desc' } });
    if (activeSub) {
      result.client = { userType: 'CLIENT', hasAccess: true, activeSub: { id: activeSub.id, status: activeSub.status, offerName: activeSub.offer.name, price: activeSub.offer.price, trainerName: activeSub.offer.partner?.user?.name, trainerImage: activeSub.offer.partner?.user?.image, since: activeSub.createdAt } };
      result.hasAccess = true;
      if (!result.userType) result.userType = 'CLIENT';
      else if (isTrainer && isClient) result.userType = 'BOTH';
    }
    if (result.hasAccess) return result;
    return { userType: (user.roles ?? [])[0] ?? 'PENDING', hasAccess: false, upgradeUrl: '/dashboard/billing', message: 'Você ainda não possui uma assinatura ativa.' };
  }
  private async getTierLimits(tierObj: any) {
    if (tierObj && typeof tierObj === 'object') return { maxAthletes: tierObj.maxAthletes ?? null, maxPlansPerMonth: tierObj.maxPlansPerMonth ?? null, allowFlexibleDistribution: tierObj.allowFlexibleDistribution ?? false };
    const tier: any = await this.prisma.partnerTier.findFirst({ where: typeof tierObj === 'string' ? { slug: tierObj, isActive: true } : { isDefault: true, isActive: true }, select: { maxAthletes: true, maxPlansPerMonth: true, allowFlexibleDistribution: true } }).catch(() => null);
    return { maxAthletes: tier?.maxAthletes ?? null, maxPlansPerMonth: tier?.maxPlansPerMonth ?? null, allowFlexibleDistribution: tier?.allowFlexibleDistribution ?? false };
  }
}
