import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import Stripe from 'stripe';
@Injectable()
export class AdminTiersService {
  constructor(private readonly prisma: PrismaService) {}
  async listar() { const tiers = await this.prisma.saaSTier.findMany({ orderBy: { price: 'asc' } }); return { tiers }; }
  async criar(data: any) {
    const { name, price, stripePriceId: rawStripePriceId, description, features, targetRole, isPopular, isActive, maxAthletes, maxPlansPerMonth, videoQualityHeights: rawVideoQualityHeights } = data;
    const VALID_HEIGHTS = [360,480,720,1080,1440,2160];
    const videoQualityHeights = Array.isArray(rawVideoQualityHeights) ? (rawVideoQualityHeights as number[]).filter(h=>VALID_HEIGHTS.includes(Number(h))).map(Number).sort((a,b)=>a-b) : [];
    if (!name || price===undefined || !description) throw new BadRequestException({ error: 'Preencha os campos obrigatórios' });
    const parsedPrice = parseFloat(String(price));
    if (!Number.isFinite(parsedPrice) || parsedPrice<0 || parsedPrice>9999.99) throw new BadRequestException({ error: 'Preço inválido' });
    const existing = await this.prisma.saaSTier.findFirst({ where: { name: { equals: String(name).trim(), mode: 'insensitive' } } });
    if (existing) throw new BadRequestException({ error: `Já existe plano "${String(name).trim()}".` });
    let finalStripePriceId = rawStripePriceId ? String(rawStripePriceId) : '';
    if (!finalStripePriceId.trim()) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy', { apiVersion: '2025-02-24.acacia' as any });
      const product = await stripe.products.create({ name: `Player.Action - ${name}`, description: String(description) });
      const sp = await stripe.prices.create({ product: product.id, unit_amount: Math.round(parsedPrice*100), currency: 'brl', recurring: { interval: 'month' } });
      finalStripePriceId = sp.id;
    }
    const tier = await this.prisma.saaSTier.create({ data: { name: String(name), price: parsedPrice, stripePriceId: finalStripePriceId, description: String(description), features: Array.isArray(features)?features:[], targetRole: targetRole?String(targetRole):'PROFESSIONAL', isPopular: Boolean(isPopular), isActive: isActive!==undefined?Boolean(isActive):true, maxAthletes: maxAthletes!=null&&maxAthletes!==''?Math.max(0,parseInt(String(maxAthletes),10)):undefined, maxPlansPerMonth: maxPlansPerMonth!=null&&maxPlansPerMonth!==''?Math.max(0,parseInt(String(maxPlansPerMonth),10)):undefined, videoQualityHeights } });
    return { tier };
  }
}
