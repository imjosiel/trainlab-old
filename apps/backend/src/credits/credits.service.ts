import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';

import { ROLES } from '@/common/constants';
import { SessionPayload } from '@/auth/session-payload';
import { PrismaService } from '@/prisma/prisma.service';
import { StripeService } from '@/billing/stripe.service';

export interface CheckoutCreditosBody {
  packageId?: string;
  currency?: 'brl' | 'usd';
}

export interface RegistrarCompraInput {
  userId: string;
  amount: number;
  description?: string;
  packageId?: string | null;
}

export interface SpendCreditsInput {
  userId: string;
  cost: number;
  feature: string;
  description?: string;
}

export interface SpendCreditsResult {
  success: boolean;
  error?: string;
  newBalance?: number;
  planCredits?: number;
  purchasedCredits?: number;
}

export interface GrantCreditsInput {
  userId: string;
  amount: number;
  grantedById?: string | null;
  description?: string;
  bucket?: 'plan' | 'purchased';
}

export interface CreditBalanceResult {
  newBalance: number;
  planCredits: number;
  purchasedCredits: number;
}

type PeriodoDeReset = 'daily' | 'weekly' | 'monthly' | 'never' | null | undefined;

function totalBalance(user: { planCredits?: number | null; purchasedCredits?: number | null }): number {
  return (user.planCredits ?? 0) + (user.purchasedCredits ?? 0);
}

function precisaResetar(lastResetAt: Date | null | undefined, period: PeriodoDeReset): boolean {
  if (!lastResetAt || !period || period === 'never') return false;
  const now = new Date();
  const last = new Date(lastResetAt);
  switch (period) {
    case 'daily':
      return now.getTime() - last.getTime() >= 86_400_000;
    case 'weekly':
      return now.getTime() - last.getTime() >= 7 * 86_400_000;
    case 'monthly':
      return (
        now.getFullYear() > last.getFullYear() ||
        (now.getFullYear() === last.getFullYear() && now.getMonth() > last.getMonth())
      );
    default:
      return false;
  }
}

/**
 * Fatia 17 — porte de `apps/web/lib/credits.ts`.
 *
 * `spendCredits`/`checkAndResetCredits` do legado viram `gastar`/o reset
 * embutido em `verSaldo`. `addPurchasedCredits` NÃO entra aqui — só tem
 * chamador no webhook compartilhado, fora do escopo desta fatia (ver spec).
 */
@Injectable()
export class CreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  /**
   * Fatia 20 — porte de `addPurchasedCredits` (lib/credits.ts). Chamado só
   * pelo webhook, depois de confirmar o pagamento. `purchasedCredits` nunca
   * reseta — diferente de `planCredits`, alocado pelo tier.
   */
  async registrarCompra({ userId, amount, description, packageId }: RegistrarCompraInput): Promise<CreditBalanceResult> {
    const existe = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existe) throw new NotFoundException({ error: 'Usuário não encontrado.' });

    const updated = await this.prisma.userCredits.upsert({
      where: { userId },
      create: { userId, purchasedCredits: amount },
      update: { purchasedCredits: { increment: amount } },
    });

    const newPlan = updated.planCredits;
    const newPurchased = updated.purchasedCredits;
    const newTotal = newPlan + newPurchased;

    await this.prisma.creditTransaction.create({
      data: {
        userId,
        type: 'PURCHASE',
        bucket: 'purchased',
        amount,
        balanceAfter: newTotal,
        description: description ?? `Compra de ${amount} créditos`,
        feature: packageId ? `package:${packageId}` : null,
      },
    });

    return { newBalance: newTotal, planCredits: newPlan, purchasedCredits: newPurchased };
  }

  /**
   * Fatia 19 — porte de `stripe/checkout-credits/route.ts`. Não depende do
   * webhook: só cria a sessão e devolve a URL. A concessão dos créditos
   * (handler `credit_purchase`) continua no webhook legado (ver spec).
   */
  async criarCheckout(user: SessionPayload, body: CheckoutCreditosBody): Promise<{ url: string | null }> {
    const { packageId, currency = 'brl' } = body;
    if (!packageId) throw new BadRequestException({ error: 'packageId é obrigatório.' });

    const settings = await this.prisma.systemSettings.findFirst({ select: { enableCreditSystem: true } });
    if (!settings?.enableCreditSystem) throw new ForbiddenException({ error: 'Sistema de créditos desativado.' });

    const pkg = await this.prisma.creditPackage.findFirst({
      where: { id: packageId, isActive: true },
      select: { id: true, name: true, credits: true, price: true, priceUsd: true },
    });
    if (!pkg) throw new NotFoundException({ error: 'Pacote não encontrado ou inativo.' });

    const baseUrl = process.env.NEXTAUTH_URL ?? '';
    if (!baseUrl) {
      throw new InternalServerErrorException({ error: 'Configuração do servidor incompleta. Contate o suporte.' });
    }

    // D92 — direto do SessionPayload (já carrega o JWT): sem consultar
    // User.subscription, que é a relação SaaS/B2C que o D83/D87 já decidiram
    // não portar.
    const unitPrice = currency === 'usd' && pkg.priceUsd ? pkg.priceUsd : pkg.price;

    const sessao = await this.stripe.criarSessaoDeCheckoutDeCreditos({
      customerId: user.stripeCustomerId ?? undefined,
      customerEmail: user.stripeCustomerId ? undefined : (user.email ?? undefined),
      successUrl: `${baseUrl}/dashboard/credits?success=1`,
      cancelUrl: `${baseUrl}/dashboard/credits?canceled=1`,
      currency,
      productName: pkg.name,
      productDescription: `${pkg.credits.toLocaleString(currency === 'brl' ? 'pt-BR' : 'en-US')} créditos Player.Action`,
      unitAmountEmCentavos: Math.round(unitPrice * 100),
      metadata: { type: 'credit_purchase', userId: user.id, packageId: pkg.id, credits: String(pkg.credits) },
    });

    return { url: sessao.url };
  }

  async verSaldo(user: SessionPayload): Promise<unknown> {
    const isTrainer = (user.roles ?? []).includes(ROLES.PROFESSIONAL);
    if (!isTrainer) return { enabled: false };

    const settings = await this.prisma.systemSettings.findFirst({
      select: { enableCreditSystem: true, creditCostPlanGen: true, creditCostAiVideo: true },
    });
    if (!settings?.enableCreditSystem) return { enabled: false };

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
    if (!dbUser) throw new NotFoundException({ error: 'Usuário não encontrado.' });

    // D87 — reset periódico só pelo caminho Partner/B2B (mesma decisão do D83).
    await this.resetarSeVencido(user.id);

    const credits = await this.prisma.userCredits.findUnique({
      where: { userId: user.id },
      select: { planCredits: true, purchasedCredits: true, lastResetAt: true },
    });

    const transactions = await this.prisma.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        type: true,
        bucket: true,
        amount: true,
        balanceAfter: true,
        feature: true,
        description: true,
        createdAt: true,
      },
    });

    const planCredits = credits?.planCredits ?? 0;
    const purchasedCredits = credits?.purchasedCredits ?? 0;

    return {
      enabled: true,
      planCredits,
      purchasedCredits,
      totalCredits: planCredits + purchasedCredits,
      lastResetAt: credits?.lastResetAt ?? null,
      costs: { planGen: settings.creditCostPlanGen, aiVideo: settings.creditCostAiVideo },
      transactions,
    };
  }

  async listarPacotesPublicos(): Promise<unknown> {
    const settings = await this.prisma.systemSettings.findFirst({ select: { enableCreditSystem: true } });
    if (!settings?.enableCreditSystem) return { packages: [] };

    const packages = await this.prisma.creditPackage.findMany({
      where: { isActive: true },
      orderBy: { credits: 'asc' },
      select: { id: true, name: true, credits: true, price: true, priceUsd: true, stripePriceId: true },
    });
    return { packages };
  }

  /**
   * D88 — sem chamador nesta fatia (é `training-plans`, que ainda não
   * migrou). Entra como preparo: quando `training-plans` migrar, o débito
   * já existe, testado.
   */
  async gastar({ userId, cost, feature, description }: SpendCreditsInput): Promise<SpendCreditsResult> {
    const settings = await this.prisma.systemSettings.findFirst();
    if (!settings?.enableCreditSystem) return { success: true };

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
    if (!user) return { success: false, error: 'Usuário não encontrado.' };

    const isTrainer = (user.roles ?? []).includes(ROLES.PROFESSIONAL);
    if (!isTrainer) return { success: true };

    const credits = await this.prisma.userCredits.findUnique({
      where: { userId },
      select: { planCredits: true, purchasedCredits: true },
    });
    const plan = credits?.planCredits ?? 0;
    const purchased = credits?.purchasedCredits ?? 0;
    const available = plan + purchased;

    if (available < cost) {
      return { success: false, error: `Créditos insuficientes. Necessário: ${cost}, disponível: ${available}.` };
    }

    const debitFromPlan = Math.min(cost, plan);
    const debitFromPurchased = cost - debitFromPlan;

    const newPlan = plan - debitFromPlan;
    const newPurchased = purchased - debitFromPurchased;
    const newTotal = newPlan + newPurchased;

    // Trava atômica: o updateMany só sucede se os saldos ainda são suficientes.
    const guardResult = await this.prisma.userCredits.updateMany({
      where: { userId, planCredits: { gte: debitFromPlan }, purchasedCredits: { gte: debitFromPurchased } },
      data: { planCredits: newPlan, purchasedCredits: newPurchased },
    });

    if (guardResult.count === 0) {
      return { success: false, error: 'Créditos insuficientes (conflito de concorrência). Tente novamente.' };
    }

    const desc = description || feature;
    const auditOps =
      debitFromPlan > 0 && debitFromPurchased > 0
        ? [
            this.prisma.creditTransaction.create({
              data: {
                userId,
                type: 'SPEND',
                bucket: 'plan',
                amount: -debitFromPlan,
                balanceAfter: newPlan + purchased,
                feature,
                description: `${desc} (parte plano)`,
              },
            }),
            this.prisma.creditTransaction.create({
              data: {
                userId,
                type: 'SPEND',
                bucket: 'purchased',
                amount: -debitFromPurchased,
                balanceAfter: newTotal,
                feature,
                description: `${desc} (parte comprados)`,
              },
            }),
          ]
        : [
            this.prisma.creditTransaction.create({
              data: {
                userId,
                type: 'SPEND',
                bucket: debitFromPlan > 0 ? 'plan' : 'purchased',
                amount: -cost,
                balanceAfter: newTotal,
                feature,
                description: desc,
              },
            }),
          ];

    // Auditoria não-crítica: o débito já foi aplicado pelo updateMany acima.
    await this.prisma.$transaction(auditOps).catch((e: Error) => {
      // eslint-disable-next-line no-console
      console.warn('[CreditsService.gastar] Falha ao registrar auditoria (débito já aplicado):', e.message);
    });

    return { success: true, newBalance: newTotal, planCredits: newPlan, purchasedCredits: newPurchased };
  }

  async conceder({ userId, amount, grantedById, description, bucket = 'plan' }: GrantCreditsInput): Promise<CreditBalanceResult> {
    const existe = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existe) throw new NotFoundException({ error: 'Usuário não encontrado.' });

    const updated = await this.prisma.userCredits.upsert({
      where: { userId },
      create: {
        userId,
        planCredits: bucket === 'plan' ? amount : 0,
        purchasedCredits: bucket === 'purchased' ? amount : 0,
      },
      update:
        bucket === 'plan' ? { planCredits: { increment: amount } } : { purchasedCredits: { increment: amount } },
    });

    const newPlan = updated.planCredits;
    const newPurchased = updated.purchasedCredits;
    const newTotal = newPlan + newPurchased;

    await this.prisma.creditTransaction.create({
      data: {
        userId,
        type: 'GRANT',
        bucket,
        amount,
        balanceAfter: newTotal,
        grantedById: grantedById ?? null,
        description: description ?? `Concessão manual — bucket ${bucket}`,
      },
    });

    return { newBalance: newTotal, planCredits: newPlan, purchasedCredits: newPurchased };
  }

  /** D87 — só o caminho Partner/B2B. Sem PartnerAccount, ou tier sem `creditsPerPeriod`, não reseta nada. */
  private async resetarSeVencido(userId: string): Promise<void> {
    const partnerAccount = await this.prisma.partnerAccount.findUnique({
      where: { userId },
      select: { tier: { select: { creditsPerPeriod: true, creditResetPeriod: true } } },
    });

    const period = partnerAccount?.tier?.creditResetPeriod as PeriodoDeReset;
    const amount = partnerAccount?.tier?.creditsPerPeriod ?? null;
    if (!period || !amount) return;

    const credits = await this.prisma.userCredits.findUnique({
      where: { userId },
      select: { planCredits: true, purchasedCredits: true, lastResetAt: true },
    });

    const needsInitialGrant = !credits?.lastResetAt;
    const needsReset = precisaResetar(credits?.lastResetAt, period);
    if (!needsInitialGrant && !needsReset) return;

    const prevPlan = credits?.planCredits ?? 0;
    const purchased = credits?.purchasedCredits ?? 0;
    const newTotal = amount + purchased;

    await this.prisma.$transaction([
      this.prisma.userCredits.upsert({
        where: { userId },
        create: { userId, planCredits: amount, lastResetAt: new Date() },
        update: { planCredits: amount, lastResetAt: new Date() },
      }),
      this.prisma.creditTransaction.create({
        data: {
          userId,
          type: 'RESET',
          bucket: 'plan',
          amount: amount - prevPlan,
          balanceAfter: newTotal,
          description: needsInitialGrant ? 'Créditos iniciais do plano' : `Reset ${period} — planCredits → ${amount}`,
        },
      }),
    ]);
  }
}

export { totalBalance };
