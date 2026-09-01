import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
import Stripe from 'stripe';
@Injectable()
export class SaasCheckoutService {
  constructor(private readonly prisma: PrismaService) {}
  private stripe() { return new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy', { apiVersion: '2025-02-24.acacia' as any }); }
  async criar(user: SessionPayload, body: any) {
    const { tierId, originUrl, currency = 'brl' } = body;
    if (!tierId) throw new BadRequestException({ error: 'ID do tier é obrigatório' });
    if (!originUrl) throw new BadRequestException({ error: 'Origin URL é obrigatória' });
    const tier: any = await this.prisma.saaSTier.findFirst({ where: { id: tierId, isActive: true } });
    if (!tier) throw new BadRequestException({ error: 'Tier não encontrado ou inativo' });
    const priceId = currency === 'usd' && tier.stripePriceIdUsd ? tier.stripePriceIdUsd : tier.stripePriceId;
    if (!priceId) throw new BadRequestException({ error: `Preço não configurado para ${currency.toUpperCase()}` });
    if ((user as any).subscriptionStatus === 'active' || (user as any).subscriptionStatus === 'trialing') throw new BadRequestException({ error: 'Você já possui uma assinatura ativa' });
    let customerId = (user as any).stripeCustomerId;
    if (!customerId && user.email) {
      const stripe = this.stripe();
      const existing: any = await stripe.customers.list({ email: user.email, limit: 1 });
      if (existing.data.length) customerId = existing.data[0].id;
      else {
        const c: any = await stripe.customers.create({ email: user.email ?? undefined, name: user.name ?? undefined, metadata: { userId: user.id } });
        customerId = c.id;
      }
      await this.prisma.userSubscription.upsert({ where: { userId: user.id }, create: { userId: user.id, stripeCustomerId: customerId }, update: { stripeCustomerId: customerId } });
    }
    if (!customerId) {
      const stripe = this.stripe();
      const c: any = await stripe.customers.create({ email: user.email ?? undefined, name: user.name ?? undefined, metadata: { userId: user.id } });
      customerId = c.id;
      await this.prisma.userSubscription.upsert({ where: { userId: user.id }, create: { userId: user.id, stripeCustomerId: customerId }, update: { stripeCustomerId: customerId } });
    }
    const baseUrl = process.env.NEXTAUTH_URL ?? '';
    if (!baseUrl) throw new InternalServerErrorException({ error: 'Configuração do servidor incompleta.' });
    const safeOriginUrl = originUrl.startsWith(baseUrl) ? originUrl : `${baseUrl}/dashboard`;
    const stripe = this.stripe();
    const session: any = await stripe.checkout.sessions.create({ customer: customerId, mode: 'subscription', payment_method_types: ['card'], line_items: [{ price: priceId, quantity: 1 }], success_url: `${safeOriginUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${safeOriginUrl}/dashboard`, metadata: { userId: user.id, tierId }, subscription_data: { metadata: { userId: user.id, tierId } } });
    return { sessionId: session.id, url: session.url };
  }
}
