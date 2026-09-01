import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}
  async get(session: SessionPayload) {
    if (!session.email) return { pendingInvite: null };
    const invite: any = await this.prisma.athleteInvite.findFirst({ where: { email: session.email.toLowerCase(), accepted: false }, include: { trainer: { select: { id: true, name: true, image: true } } } });
    if (!invite) return { pendingInvite: null };
    let profile: any = null;
    if (invite.studentId) {
      const student: any = await this.prisma.student.findUnique({ where: { id: invite.studentId }, include: { athleteProfiles: { include: { sport: { select: { id: true, name: true, slug: true } } }, take: 1 } } });
      profile = student?.athleteProfiles[0] ?? null;
    }
    return { pendingInvite: { inviteId: invite.id, token: invite.token, trainerName: invite.trainer?.name ?? null, trainerImage: invite.trainer?.image ?? null, trainerId: invite.trainer?.id ?? null, sport: profile?.sport ? { id: profile.sport.id, name: profile.sport.name, slug: profile.sport.slug } : null, position: profile?.position ?? null, dateOfBirth: profile?.dateOfBirth ? profile.dateOfBirth.toISOString() : null, height: profile?.height ?? null, weight: profile?.weight ?? null } };
  }
  async post(session: SessionPayload, body: any) {
    const { role, phone } = body;
    const VALID = ['PROFESSIONAL','INDIVIDUAL','CLIENT','PARTNER_B2B','AFFILIATE'];
    if (!role || !VALID.includes(role)) throw new BadRequestException({ error: 'Role inválido.' });
    const atual: any = await this.prisma.user.findUnique({ where: { id: session.id }, select: { roles: true, termsAcceptedAt: true, privacyAcceptedAt: true } });
    const preservados = (atual?.roles ?? []).filter((r: string) => !['PENDING','PROFESSIONAL','INDIVIDUAL','CLIENT'].includes(r));
    let escolhidos: string[] = [role];
    if (role === 'PARTNER_B2B') escolhidos = ['PROFESSIONAL','PARTNER_B2B'];
    if (role === 'CLIENT') escolhidos = Array.from(new Set([...(atual?.roles ?? []), 'CLIENT']));
    const finalRoles = Array.from(new Set([...preservados, ...escolhidos]));
    const phoneData: any = {};
    if (['PROFESSIONAL','PARTNER_B2B'].includes(role) && phone) {
      const digits = String(phone).replace(/\D/g, '').replace(/^55/,'');
      if (digits.length >= 10 && digits.length <= 11) phoneData.phone = digits.length===11 ? `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}` : `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
    }
    // Cria PartnerAccount / AffiliateAccount quando necessário (BUG que deixou josielcardosomercio@gmail.com com role sem conta)
    if (role === 'PARTNER_B2B') {
      const existingPA: any = await this.prisma.partnerAccount.findUnique({ where: { userId: session.id } });
      if (!existingPA) {
        const settings: any = await this.prisma.systemSettings.findFirst({ select: { autoApprovePartners: true } }).catch(() => null);
        const autoApprove = settings?.autoApprovePartners !== false;
        const starter: any = await this.prisma.partnerTier.findFirst({ where: { isDefault: true, isActive: true } }).catch(() => null);
        await this.prisma.partnerAccount.create({
          data: {
            userId: session.id,
            status: autoApprove ? 'approved' : 'pending',
            partnerTier: starter?.slug ?? 'starter',
            tierId: starter?.id ?? null,
            commissionRate: starter?.commissionRate ?? 0.50,
            approvedAt: autoApprove ? new Date() : null,
          },
        }).catch((e: any) => { if (e.code !== 'P2002') throw e; });
      }
    }
    if (role === 'AFFILIATE') {
      const existingAA: any = await this.prisma.affiliateAccount.findUnique({ where: { userId: session.id } }).catch(() => null);
      if (!existingAA) {
        const code = `aff-${session.id.slice(0, 8)}-${Date.now().toString(36)}`;
        await this.prisma.affiliateAccount.create({ data: { userId: session.id, referralCode: code, status: 'approved' } }).catch((e: any) => { if (e.code !== 'P2002') throw e; });
      }
    }
    const now = new Date();
    const consent: any = {};
    if (!atual?.termsAcceptedAt) { consent.termsAcceptedAt = now; consent.termsVersion = '2026-07-06'; }
    if (!atual?.privacyAcceptedAt) consent.privacyAcceptedAt = now;
    await this.prisma.user.update({ where: { id: session.id }, data: { roles: finalRoles as any, ...phoneData, ...consent } });
    return { success: true, message: 'Onboarding concluído com sucesso!' };
  }
}
