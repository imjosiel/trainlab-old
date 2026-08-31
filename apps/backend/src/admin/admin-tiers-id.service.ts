import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import Stripe from 'stripe';
@Injectable()
export class AdminTiersIdService {
  constructor(private readonly prisma: PrismaService) {}
  async atualizar(id: string, data: any) {
    const existing: any = await this.prisma.saaSTier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ error: 'Plano não encontrado' });
    let finalStripePriceId = data.stripePriceId !== undefined && data.stripePriceId !== '' ? String(data.stripePriceId) : existing.stripePriceId;
    if (data.price !== undefined && parseFloat(String(data.price)) !== existing.price && (!data.stripePriceId || String(data.stripePriceId) === existing.stripePriceId)) {
      const parsedNewPrice = parseFloat(String(data.price));
      if (!Number.isFinite(parsedNewPrice) || parsedNewPrice < 0 || parsedNewPrice > 9999.99) throw new BadRequestException({ error: 'Preço inválido' });
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy', { apiVersion: '2025-02-24.acacia' as any });
      try {
        let productId: string | null = null;
        if (existing.stripePriceId) {
          try { const oldPrice: any = await stripe.prices.retrieve(existing.stripePriceId); productId = typeof oldPrice.product === 'string' ? oldPrice.product : null; await stripe.prices.update(existing.stripePriceId, { active: false }); } catch {}
        }
        if (!productId) { const p = await stripe.products.create({ name: `Player.Action - ${data.name ?? existing.name}`, description: String(data.description ?? existing.description) }); productId = p.id; }
        const newPrice = await stripe.prices.create({ product: String(productId), unit_amount: Math.round(parsedNewPrice * 100), currency: 'brl', recurring: { interval: 'month' } });
        finalStripePriceId = newPrice.id;
      } catch (e) { throw new BadRequestException({ error: 'Erro ao atualizar preço na Stripe.' }); }
    }
    const updated = await this.prisma.saaSTier.update({ where: { id }, data: { name: data.name !== undefined ? String(data.name) : undefined, price: data.price !== undefined ? parseFloat(String(data.price)) : undefined, stripePriceId: finalStripePriceId ?? undefined, description: data.description !== undefined ? String(data.description) : undefined, features: Array.isArray(data.features) ? data.features : undefined, targetRole: data.targetRole !== undefined ? String(data.targetRole) : undefined, isPopular: data.isPopular !== undefined ? Boolean(data.isPopular) : undefined, isActive: data.isActive !== undefined ? Boolean(data.isActive) : undefined } });
    return { tier: updated };
  }
  async remover(id: string) {
    const tier: any = await this.prisma.saaSTier.findUnique({ where: { id }, select: { name: true } });
    if (!tier) throw new NotFoundException({ error: 'Plano não encontrado.' });
    const cnt = await this.prisma.userSubscription.count({ where: { plan: { equals: tier.name, mode: 'insensitive' } } });
    if (cnt > 0) throw new BadRequestException({ error: `Não é possível excluir este plano pois ${cnt} usuário(s) ainda estão vinculados.` });
    await this.prisma.saaSTier.delete({ where: { id } });
    return { success: true };
  }
}
