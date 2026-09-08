import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
@Injectable()
export class PartnerSettingsService {
  constructor(private readonly prisma: PrismaService) {}
  async get(user: SessionPayload) {
    const isPartner = (user.roles ?? []).includes('PARTNER_B2B');
    let pa: any = await this.prisma.partnerAccount.findUnique({ where: { userId: user.id }, select: { id: true, status: true, allowTestMode: true, partnerTier: true, chargesEnabled: true, payoutsEnabled: true } });
    if (!pa && isPartner && !user.isAdmin) {
      const starter: any = await this.prisma.partnerTier.findFirst({ where: { isDefault: true, isActive: true } });
      try {
        pa = await this.prisma.partnerAccount.create({ data: { userId: user.id, status: 'approved', partnerTier: starter?.slug ?? 'starter', stripeAccountId: null, payoutsEnabled: false, chargesEnabled: false, ...(starter ? { tierId: starter.id } : {}) }, select: { id: true, status: true, allowTestMode: true, partnerTier: true, chargesEnabled: true, payoutsEnabled: true } });
      } catch (e: any) {
        if (e.code === 'P2002') pa = await this.prisma.partnerAccount.findUnique({ where: { userId: user.id }, select: { id: true, status: true, allowTestMode: true, partnerTier: true, chargesEnabled: true, payoutsEnabled: true } });
        else throw e;
      }
      if (pa) {
        const roles = user.roles ?? [];
        const toAdd = ['PROFESSIONAL','PARTNER_B2B'].filter(r => !roles.includes(r));
        if (toAdd.length) await this.prisma.user.update({ where: { id: user.id }, data: { roles: Array.from(new Set([...roles, ...toAdd])) as any } });
      }
    }
    if (!pa) throw new NotFoundException({ error: 'Candidatura de parceiro não encontrada.' });
    const settings: any = await this.prisma.systemSettings.findFirst({ select: { enableB2BTestMode: true } });
    return { partnerAccount: pa, systemSettings: settings };
  }
  async update(user: SessionPayload, body: any) {
    const isPartner = (user.roles ?? []).includes('PARTNER_B2B');
    if (!user.isAdmin && !isPartner) throw new NotFoundException({ error: 'Acesso restrito a parceiros.' });
    const acc: any = await this.prisma.partnerAccount.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!acc) throw new NotFoundException({ error: 'Conta de parceiro não encontrada.' });
    const updated: any = await this.prisma.partnerAccount.update({ where: { userId: user.id }, data: { allowTestMode: Boolean(body.allowTestMode) } });
    return updated;
  }
}
