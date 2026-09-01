import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
import Stripe from 'stripe';
@Injectable()
export class PartnerTierRequestService {
  constructor(private readonly prisma: PrismaService) {}
  async get(user: SessionPayload) {
    const pa: any = await this.prisma.partnerAccount.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!pa) return { request: null };
    const pending: any = await this.prisma.partnerTierRequest.findFirst({ where: { partnerId: pa.id, status: 'pending' }, include: { toTier: { select: { name: true, slug: true } } }, orderBy: { createdAt: 'desc' } });
    return { request: pending };
  }
  async post(user: SessionPayload, body: any) {
    const { toTierId } = body;
    if (!toTierId) throw new BadRequestException({ error: 'Tier de destino não informado.' });
    const [pa, toTier, settings]: any[] = await Promise.all([
      this.prisma.partnerAccount.findUnique({ where: { userId: user.id }, select: { id: true, tierId: true, partnerTier: true, status: true } }),
      this.prisma.partnerTier.findFirst({ where: { id: toTierId, isActive: true }, select: { id: true, slug: true, name: true, price: true, commissionRate: true, maxAthletes: true, maxPlansPerMonth: true } }),
      this.prisma.systemSettings.findFirst({ select: { autoApproveTierChange: true } }),
    ]);
    if (!pa) throw new NotFoundException({ error: 'Conta de parceiro não encontrada.' });
    if (pa.status !== 'approved') throw new ForbiddenException({ error: 'Sua conta de parceiro ainda não está aprovada.' });
    if (!toTier) throw new NotFoundException({ error: 'Tier de destino não encontrado ou inativo.' });
    if (pa.tierId === toTier.id || pa.partnerTier === toTier.slug) throw new BadRequestException({ error: 'Você já está neste tier.' });
    if (toTier.price > 0) {
      const email = user.email;
      if (!email) throw new BadRequestException({ error: 'Email não disponível.' });
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy', { apiVersion: '2025-02-24.acacia' as any });
      let customerId: string | undefined;
      const existingSub: any = await this.prisma.userSubscription.findUnique({ where: { userId: user.id }, select: { stripeCustomerId: true } });
      if (existingSub?.stripeCustomerId) customerId = existingSub.stripeCustomerId;
      else {
        const customers: any = await stripe.customers.list({ email, limit: 1 });
        if (customers.data.length) customerId = customers.data[0].id;
        else {
          const c: any = await stripe.customers.create({ email, name: user.name ?? undefined, metadata: { userId: user.id } });
          customerId = c.id;
        }
        await this.prisma.userSubscription.upsert({ where: { userId: user.id }, create: { userId: user.id, stripeCustomerId: customerId }, update: { stripeCustomerId: customerId } });
      }
      let stripePriceId: string | undefined;
      const products: any = await stripe.products.search({ query: `metadata['tierId']:'${toTier.id}' AND active:'true'`, limit: 1 }).catch(() => ({ data: [] }));
      if (products.data.length) {
        const prices: any = await stripe.prices.list({ product: products.data[0].id, currency: 'brl', active: true, limit: 1 });
        const match = prices.data.find((p: any) => p.unit_amount === Math.round(toTier.price * 100) && p.recurring?.interval === 'month');
        if (match) stripePriceId = match.id;
      }
      if (!stripePriceId) {
        const np: any = await stripe.prices.create({ unit_amount: Math.round(toTier.price * 100), currency: 'brl', recurring: { interval: 'month' }, product_data: { name: `Player.Action — Tier ${toTier.name}`, metadata: { tierId: toTier.id } } });
        stripePriceId = np.id;
      }
      const baseUrl = process.env.NEXTAUTH_URL ?? '';
      if (!baseUrl) throw new BadRequestException({ error: 'Configuração do servidor incompleta.' });
      const returnBase = `${baseUrl}/dashboard/subscription`;
      const session: any = await stripe.checkout.sessions.create({ customer: customerId, mode: 'subscription', ui_mode: 'embedded', line_items: [{ price: stripePriceId, quantity: 1 }], return_url: `${returnBase}?tier_success=true&session_id={CHECKOUT_SESSION_ID}`, subscription_data: { metadata: { type: 'partner_tier_payment', partnerId: pa.id, fromTierId: pa.tierId ?? '', toTierId: toTier.id, toTierSlug: toTier.slug, userId: user.id } }, metadata: { type: 'partner_tier_payment', partnerId: pa.id, fromTierId: pa.tierId ?? '', toTierId: toTier.id, toTierSlug: toTier.slug, userId: user.id } });
      return { success: false, requiresPayment: true, clientSecret: session.client_secret };
    }
    if (toTier.maxAthletes !== null) {
      const [direct, b2b] = await Promise.all([this.prisma.student.count({ where: { trainerId: user.id } }), this.prisma.partnerSubscription.count({ where: { offer: { partner: { userId: user.id } }, status: { in: ['active','canceling','trialing','past_due'] } } })]);
      const total = direct + b2b;
      if (total > toTier.maxAthletes) throw new BadRequestException({ error: `Você tem ${total} aluno(s), mas o tier "${toTier.name}" permite no máximo ${toTier.maxAthletes}.` });
    }
    const autoApprove = settings?.autoApproveTierChange !== false;
    if (autoApprove) {
      await this.prisma.$transaction([this.prisma.partnerAccount.update({ where: { id: pa.id }, data: { tierId: toTier.id, partnerTier: toTier.slug, commissionRate: toTier.commissionRate } }), this.prisma.partnerTierRequest.create({ data: { partnerId: pa.id, fromTierId: pa.tierId, toTierId: toTier.id, status: 'auto_approved' } })]);
      return { success: true, immediate: true, message: `Tier alterado para "${toTier.name}" com sucesso.` };
    }
    const existingReq: any = await this.prisma.partnerTierRequest.findFirst({ where: { partnerId: pa.id, status: 'pending' } });
    if (existingReq) throw new BadRequestException({ error: 'Você já possui uma solicitação pendente.' });
    await this.prisma.partnerTierRequest.create({ data: { partnerId: pa.id, fromTierId: pa.tierId, toTierId: toTier.id, status: 'pending' } });
    return { success: true, immediate: false, message: `Solicitação de mudança para "${toTier.name}" enviada.` };
  }
}
