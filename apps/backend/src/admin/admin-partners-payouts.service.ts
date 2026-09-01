import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import Stripe from 'stripe';
@Injectable()
export class AdminPartnersPayoutsService {
  constructor(private readonly prisma: PrismaService) {}
  private stripe() { return new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy', { apiVersion: '2025-02-24.acacia' as any }); }
  async listar(id: string) {
    const pa: any = await this.prisma.partnerAccount.findUnique({ where: { id }, select: { stripeAccountId: true, userId: true } });
    if (!pa?.stripeAccountId) throw new BadRequestException({ error: 'Conta Stripe não configurada.' });
    const stripe = this.stripe();
    const [transfers, payouts, balance] = await Promise.all([
      stripe.transfers.list({ destination: pa.stripeAccountId, limit: 20 }),
      (stripe.payouts.list as any)({ limit: 20 }, { stripeAccount: pa.stripeAccountId }).catch(() => ({ data: [] } as any)),
      (stripe.balance.retrieve as any)({ stripeAccount: pa.stripeAccountId }).catch(() => null as any),
    ]);
    const available = (balance as any)?.available?.find((b: any) => b.currency === 'brl')?.amount ?? 0;
    const pending = (balance as any)?.pending?.find((b: any) => b.currency === 'brl')?.amount ?? 0;
    return { transfers: (transfers as any).data, payouts: (payouts as any).data, balance: { available, pending } };
  }
  async criar(id: string, actorId: string, actorName: string) {
    const pa: any = await this.prisma.partnerAccount.findUnique({ where: { id }, select: { stripeAccountId: true, payoutsEnabled: true } });
    if (!pa?.stripeAccountId) throw new BadRequestException({ error: 'Conta Stripe não configurada.' });
    if (!pa.payoutsEnabled) throw new BadRequestException({ error: 'Repasses não habilitados.' });
    const stripe = this.stripe();
    const balance: any = await (stripe.balance.retrieve as any)({ stripeAccount: pa.stripeAccountId });
    const available = balance.available.find((b: any) => b.currency === 'brl')?.amount ?? 0;
    if (available <= 0) throw new BadRequestException({ error: 'Saldo disponível insuficiente.' });
    const payout: any = await (stripe.payouts.create as any)({ amount: available, currency: 'brl' }, { stripeAccount: pa.stripeAccountId });
    await this.prisma.auditLog.create({ data: { actorId, actorName, action: 'PAYOUT_TRIGGER', entity: 'PartnerAccount', entityId: pa.id, details: { amount: available, currency: 'brl', payoutId: payout.id } as any } }).catch(()=>{});
    return { payout };
  }
}
