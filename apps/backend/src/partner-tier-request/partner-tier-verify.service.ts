import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
import Stripe from 'stripe';
@Injectable()
export class PartnerTierVerifyService {
  constructor(private readonly prisma: PrismaService) {}
  async verificar(session: SessionPayload, sessionId: string) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy', { apiVersion: '2025-02-24.acacia' as any });
    const cs: any = await stripe.checkout.sessions.retrieve(sessionId);
    if (cs.metadata?.type !== 'partner_tier_payment' || cs.payment_status === 'unpaid') return { updated: false, reason: 'Pagamento ainda não confirmado ou tipo incorreto.' };
    const { partnerId, toTierId, toTierSlug, fromTierId } = cs.metadata as Record<string, string>;
    if (!partnerId || !toTierId || !toTierSlug) return { updated: false, reason: 'Metadata incompleto na sessão Stripe.' };
    const pa: any = await this.prisma.partnerAccount.findUnique({ where: { id: partnerId }, select: { id: true, userId: true, tierId: true } });
    if (!pa || pa.userId !== session.id) return { error: 'Conta de parceiro inválida.' };
    const toTier: any = await this.prisma.partnerTier.findUnique({ where: { id: toTierId }, select: { id: true, slug: true, name: true, commissionRate: true } });
    if (!toTier) return { updated: false, reason: 'Tier não encontrado.' };
    if (pa.tierId === toTier.id) return { updated: false, alreadyCurrent: true, tierName: toTier.name };
    await this.prisma.$transaction([
      this.prisma.partnerAccount.update({ where: { id: partnerId }, data: { tierId: toTier.id, partnerTier: toTier.slug, commissionRate: toTier.commissionRate } }),
      this.prisma.partnerTierRequest.create({ data: { partnerId, fromTierId: fromTierId || null, toTierId: toTier.id, status: 'auto_approved', note: `Verificação direta via session_id (fallback webhook): ${sessionId}` } }),
    ] as any);
    return { updated: true, tierName: toTier.name };
  }
}
