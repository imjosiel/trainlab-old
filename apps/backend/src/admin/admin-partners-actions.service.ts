import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminPartnersActionsService {
  constructor(private readonly prisma: PrismaService) {}
  async atualizar(id: string, actorId: string, body: any) {
    const { action, rejectionReason, partnerTier, commissionRate, financials } = body;
    if (!['approve','reject','suspend','update_financials'].includes(action)) throw new BadRequestException({ error: 'Ação inválida.' });
    const account: any = await this.prisma.partnerAccount.findUnique({ where: { id }, include: { user: true } });
    if (!account) throw new NotFoundException({ error: 'Conta de parceiro não encontrada.' });
    let updateData: any = {};
    let userUpdateData: any = {};
    if (action === 'approve') {
      const tierData: any = partnerTier ? await this.prisma.partnerTier.findFirst({ where: { slug: partnerTier }, select: { commissionRate: true, id: true, slug: true } }) : await this.prisma.partnerTier.findFirst({ where: { isDefault: true, isActive: true }, select: { commissionRate: true, id: true, slug: true } });
      const tierSlug = tierData?.slug ?? partnerTier ?? 'starter';
      const rawRate = commissionRate !== undefined ? parseFloat(String(commissionRate)) : (tierData?.commissionRate ?? null);
      const safeRate = (rawRate !== null && Number.isFinite(rawRate) && rawRate >= 0 && rawRate <= 1) ? rawRate : (tierData?.commissionRate ?? 0.50);
      updateData = { status: 'approved', approvedAt: new Date(), approvedById: actorId, rejectionReason: null, partnerTier: tierSlug, tierId: tierData?.id ?? null, commissionRate: safeRate };
      const roles = account.user.roles ?? [];
      if (!roles.includes('PARTNER_B2B')) userUpdateData = { roles: { set: Array.from(new Set([...roles, 'PROFESSIONAL', 'PARTNER_B2B'])) } };
    } else if (action === 'reject') {
      if (!rejectionReason) throw new BadRequestException({ error: 'Motivo da rejeição é obrigatório.' });
      updateData = { status: 'rejected', rejectionReason };
      const roles = account.user.roles ?? [];
      if (roles.includes('PARTNER_B2B')) userUpdateData = { roles: { set: roles.filter((r: string) => r !== 'PARTNER_B2B') } };
    } else if (action === 'suspend') {
      updateData = { status: 'suspended', rejectionReason: rejectionReason ?? 'Conta suspensa pela administração.' };
      const roles = account.user.roles ?? [];
      if (roles.includes('PARTNER_B2B')) userUpdateData = { roles: { set: roles.filter((r: string) => r !== 'PARTNER_B2B') } };
    } else {
      const parsedCustomRate = financials?.customCommissionRate !== undefined && financials.customCommissionRate !== '' ? parseFloat(String(financials.customCommissionRate)) : null;
      updateData = { customCommissionRate: parsedCustomRate !== null && Number.isFinite(parsedCustomRate) && parsedCustomRate >= 0 && parsedCustomRate <= 1 ? parsedCustomRate : null };
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.partnerAccount.update({ where: { id }, data: updateData }),
      ...(Object.keys(userUpdateData).length ? [this.prisma.user.update({ where: { id: account.userId }, data: userUpdateData })] : []),
    ] as any);
    const notifMap: any = {
      approve: { type: 'PARTNER_APPROVED', title: '🎉 Aprovada!', message: 'Parabéns!', link: '/dashboard/partner' },
      reject: { type: 'PARTNER_REJECTED', title: '❌ Rejeitada', message: `Motivo: ${rejectionReason}`, link: '/dashboard/partner' },
      suspend: { type: 'PARTNER_SUSPENDED', title: '⚠️ Suspensa', message: 'Suspensa', link: '/dashboard/partner' },
    };
    const notif = notifMap[action];
    if (notif) void this.prisma.notification.create({ data: { userId: account.userId, type: notif.type, title: notif.title, message: notif.message, link: notif.link } }).catch(() => {});
    return { success: true, account: updated };
  }
}
