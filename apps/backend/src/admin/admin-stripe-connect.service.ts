import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import Stripe from 'stripe';
@Injectable()
export class AdminStripeConnectService {
  constructor(private readonly prisma: PrismaService) {}
  private stripe() { return new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy', { apiVersion: '2025-02-24.acacia' as any }); }
  async listar() {
    const stripe = this.stripe();
    const all: Stripe.Account[] = [];
    let startingAfter: string | undefined;
    while (true) {
      const page: any = await stripe.accounts.list({ limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
      all.push(...page.data);
      if (!page.has_more) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
    const dbAccounts: any[] = await this.prisma.partnerAccount.findMany({ where: { stripeAccountId: { not: null } }, select: { stripeAccountId: true, userId: true, status: true, user: { select: { name: true, email: true } } } });
    const dbMap = new Map(dbAccounts.map((a: any) => [a.stripeAccountId, a]));
    const accounts = all.map((a: any) => ({ id: a.id, email: a.email ?? null, metaUserId: a.metadata?.userId ?? null, createdAt: a.created ? new Date(a.created * 1000).toISOString() : null, chargesEnabled: a.charges_enabled, payoutsEnabled: a.payouts_enabled, dbRecord: dbMap.get(a.id) ?? null, isOrphan: !dbMap.has(a.id) }));
    return { accounts, total: accounts.length };
  }
  async remover(accountId: string) {
    if (!accountId) throw new BadRequestException({ error: 'accountId é obrigatório.' });
    const linked: any = await this.prisma.partnerAccount.findFirst({ where: { stripeAccountId: accountId } });
    if (linked) throw new BadRequestException({ error: 'Esta conta está vinculada a um parceiro ativo no banco. Remova o vínculo primeiro.' });
    await this.stripe().accounts.del(accountId);
    return { success: true, message: `Conta ${accountId} deletada com sucesso.` };
  }
}
