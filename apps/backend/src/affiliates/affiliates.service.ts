import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { SessionPayload } from '@/auth/session-payload';
import { ROLES } from '@/common/constants';
import { parseLimit, parsePage } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import { StripeService } from '@/billing/stripe.service';

export interface CriarSessaoDeOnboardingBody {
  components?: unknown;
}

export interface ListarGanhosQuery {
  page?: string;
  limit?: string;
  startDate?: string;
  endDate?: string;
}

export interface ResultadoDeSincronizacaoDeAfiliado {
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  stripeAccountStatus: string;
  flushedEarnings?: number;
}

type AllowedComponent = 'account_onboarding' | 'account_management' | 'payouts';

const COMPONENT_MAP: Record<AllowedComponent, Record<string, { enabled: boolean }>> = {
  account_onboarding: { account_onboarding: { enabled: true } },
  account_management: { account_management: { enabled: true } },
  payouts: { payouts: { enabled: true } },
};

const FLUSH_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function ehAfiliado(user: SessionPayload): boolean {
  return Boolean(user.roles?.includes(ROLES.AFFILIATE)) || user.isAdmin;
}

/**
 * Fatia 22 — Stripe Connect e ganhos do afiliado (docs/implementation-plans/epic-nest-affiliates.md).
 */
@Injectable()
export class AffiliatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  async configurarConta(user: SessionPayload): Promise<{ stripeAccountId: string }> {
    if (!ehAfiliado(user)) {
      throw new ForbiddenException({ error: 'Acesso restrito a afiliados.' });
    }

    const conta = await this.prisma.affiliateAccount.findUnique({ where: { userId: user.id } });
    if (!conta) throw new NotFoundException({ error: 'Conta de afiliado não encontrada.' });
    if (conta.stripeAccountId) return { stripeAccountId: conta.stripeAccountId };

    const contaConectada = await this.stripe.buscarOuCriarContaConectadaDeAfiliado({
      userId: user.id,
      email: user.email,
      affiliateAccountId: conta.id,
    });

    await this.prisma.affiliateAccount.update({
      where: { id: conta.id },
      data: { stripeAccountId: contaConectada.id, stripeAccountStatus: 'pending' },
    });

    return { stripeAccountId: contaConectada.id };
  }

  async criarSessaoDeOnboarding(
    user: SessionPayload,
    body: CriarSessaoDeOnboardingBody,
  ): Promise<{ clientSecret: string | null }> {
    const conta = await this.prisma.affiliateAccount.findUnique({
      where: { userId: user.id },
      select: { stripeAccountId: true },
    });
    if (!conta?.stripeAccountId) {
      throw new BadRequestException({ error: 'Conta Stripe Connect não configurada. Complete o setup primeiro.' });
    }

    const components = (Array.isArray(body.components) ? body.components : ['account_onboarding']) as AllowedComponent[];

    const enabledComponents = components.reduce<Record<string, { enabled: boolean }>>((acc, componente) => {
      if (COMPONENT_MAP[componente]) return { ...acc, ...COMPONENT_MAP[componente] };
      return acc;
    }, {});

    if (Object.keys(enabledComponents).length === 0) {
      throw new BadRequestException({
        error: `Nenhum componente válido especificado. Use: ${Object.keys(COMPONENT_MAP).join(', ')}.`,
      });
    }

    return this.stripe.criarSessaoDeConta(conta.stripeAccountId, enabledComponents);
  }

  async sincronizar(user: SessionPayload): Promise<ResultadoDeSincronizacaoDeAfiliado> {
    const conta = await this.prisma.affiliateAccount.findUnique({
      where: { userId: user.id },
      select: { id: true, stripeAccountId: true, payoutsEnabled: true, pendingBalance: true },
    });
    if (!conta?.stripeAccountId) {
      throw new BadRequestException({ error: 'Conta Stripe Connect não configurada.' });
    }

    const statusStripe = await this.stripe.buscarContaConectada(conta.stripeAccountId);

    let stripeAccountStatus: string;
    if (statusStripe.payoutsEnabled) {
      stripeAccountStatus = 'active';
    } else if (statusStripe.disabledReason) {
      stripeAccountStatus = 'restricted';
    } else {
      stripeAccountStatus = 'pending';
    }

    await this.prisma.affiliateAccount.update({
      where: { id: conta.id },
      data: {
        payoutsEnabled: statusStripe.payoutsEnabled,
        chargesEnabled: statusStripe.chargesEnabled,
        stripeAccountStatus,
      },
    });

    let flushedCount = 0;
    const justActivated = statusStripe.payoutsEnabled && !conta.payoutsEnabled;
    const hasPending = conta.pendingBalance > 0;

    if (justActivated && hasPending) {
      flushedCount = await this.flushEarningsPendentes(conta.id, conta.stripeAccountId);
    }

    return {
      payoutsEnabled: statusStripe.payoutsEnabled,
      chargesEnabled: statusStripe.chargesEnabled,
      stripeAccountStatus,
      ...(flushedCount > 0 ? { flushedEarnings: flushedCount } : {}),
    };
  }

  /**
   * D98 — reverte earnings presos em 'flushing' (crash no meio de um flush
   * anterior), trava atomicamente os `pending` desta conta, transfere um a
   * um, e só soma no saldo os que REALMENTE saíram. O lock em si só é
   * provado por e2e contra Postgres real (mesma lição do D89) — mock de
   * `updateMany` não avalia `where`.
   */
  private async flushEarningsPendentes(affiliateId: string, stripeAccountId: string): Promise<number> {
    const stuckCutoff = new Date(Date.now() - FLUSH_TIMEOUT_MS);
    await this.prisma.affiliateEarning.updateMany({
      where: { affiliateId, status: 'flushing', updatedAt: { lt: stuckCutoff } },
      data: { status: 'pending' },
    });

    const lockResult = await this.prisma.affiliateEarning.updateMany({
      where: { affiliateId, status: 'pending' },
      data: { status: 'flushing' },
    });
    if (lockResult.count === 0) return 0;

    const earningsPresos = await this.prisma.affiliateEarning.findMany({
      where: { affiliateId, status: 'flushing' },
      select: { id: true, earnedAmount: true, partnerId: true },
    });

    let flushedTotal = 0;
    let flushedCount = 0;

    for (const earning of earningsPresos) {
      try {
        await this.stripe.transferir({
          valorEmCentavos: earning.earnedAmount,
          destino: stripeAccountId,
          metadata: {
            type: 'affiliate_commission_flush',
            affiliateId,
            partnerId: earning.partnerId,
            earningId: earning.id,
          },
        });
        await this.prisma.affiliateEarning.update({ where: { id: earning.id }, data: { status: 'available' } });
        flushedTotal += earning.earnedAmount;
        flushedCount += 1;
      } catch {
        await this.prisma.affiliateEarning
          .update({ where: { id: earning.id }, data: { status: 'pending' } })
          .catch(() => {});
      }
    }

    if (flushedCount > 0) {
      await this.prisma.affiliateAccount.update({
        where: { id: affiliateId },
        data: { pendingBalance: { decrement: flushedTotal }, availableBalance: { increment: flushedTotal } },
      });
    }

    return flushedCount;
  }

  async listarGanhos(user: SessionPayload, query: ListarGanhosQuery): Promise<unknown> {
    if (!ehAfiliado(user)) throw new ForbiddenException({ error: 'Acesso negado' });

    const conta = await this.prisma.affiliateAccount.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!conta) throw new NotFoundException({ error: 'Conta de afiliado não encontrada' });

    const page = parsePage(query.page);
    const limit = parseLimit(query.limit, DEFAULT_LIMIT, MAX_LIMIT);

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (query.startDate) {
      const startDate = new Date(query.startDate);
      if (!Number.isNaN(startDate.getTime())) {
        startDate.setHours(0, 0, 0, 0);
        dateFilter.gte = startDate;
      }
    }
    if (query.endDate) {
      const endDate = new Date(query.endDate);
      if (!Number.isNaN(endDate.getTime())) {
        endDate.setHours(23, 59, 59, 999);
        dateFilter.lte = endDate;
      }
    }
    if (dateFilter.gte && dateFilter.lte && dateFilter.lte < dateFilter.gte) {
      throw new BadRequestException({ error: 'endDate deve ser igual ou posterior a startDate' });
    }

    // A87 — bug do legado: o `where` original filtrava por `affiliateAccountId`,
    // campo que não existe em AffiliateEarning (é affiliateId). GET /api/affiliate/earnings
    // sempre 500ava na prática; os testes do legado passavam porque mockam o Prisma
    // inteiro e nunca validam contra o schema real.
    const where = {
      affiliateId: conta.id,
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    };

    const [total, earnings] = await Promise.all([
      this.prisma.affiliateEarning.count({ where }),
      this.prisma.affiliateEarning.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          earnedAmount: true,
          baseAmount: true,
          commissionRate: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    return { earnings, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async relatorio(user: SessionPayload): Promise<unknown> {
    if (!ehAfiliado(user)) throw new ForbiddenException({ error: 'Acesso negado' });

    const conta = await this.prisma.affiliateAccount.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!conta) throw new NotFoundException({ error: 'Conta de afiliado não encontrada' });

    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [referredPartners, allEarnings] = await Promise.all([
      this.prisma.partnerAccount.findMany({
        where: { affiliateAccountId: conta.id },
        select: {
          id: true,
          status: true,
          partnerTier: true,
          createdAt: true,
          user: { select: { name: true, image: true } },
          offers: {
            where: { isActive: true, archivedAt: null },
            select: { subscriptions: { where: { status: { in: ['active', 'trialing'] } }, select: { id: true } } },
          },
        },
      }),
      this.prisma.affiliateEarning.findMany({
        where: { affiliateId: conta.id },
        select: { partnerId: true, earnedAmount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const earningsByPartner: Record<
      string,
      { totalEarned: number; earnedThisMonth: number; lastEarningDate: Date | null; byMonth: Record<string, number> }
    > = {};

    for (const e of allEarnings) {
      if (!earningsByPartner[e.partnerId]) {
        earningsByPartner[e.partnerId] = { totalEarned: 0, earnedThisMonth: 0, lastEarningDate: null, byMonth: {} };
      }
      const grupo = earningsByPartner[e.partnerId];
      grupo.totalEarned += e.earnedAmount;
      if (e.createdAt >= startOfCurrentMonth) grupo.earnedThisMonth += e.earnedAmount;
      if (!grupo.lastEarningDate || e.createdAt > grupo.lastEarningDate) grupo.lastEarningDate = e.createdAt;
      const monthKey = `${e.createdAt.getFullYear()}-${String(e.createdAt.getMonth() + 1).padStart(2, '0')}`;
      grupo.byMonth[monthKey] = (grupo.byMonth[monthKey] ?? 0) + e.earnedAmount;
    }

    const partners = referredPartners
      .map((p) => {
        const activeStudentsCount = p.offers.reduce((soma, oferta) => soma + oferta.subscriptions.length, 0);
        const earnings = earningsByPartner[p.id] ?? {
          totalEarned: 0,
          earnedThisMonth: 0,
          lastEarningDate: null,
          byMonth: {},
        };
        return {
          id: p.id,
          name: p.user?.name ?? 'Parceiro',
          image: p.user?.image ?? null,
          tier: p.partnerTier,
          status: p.status,
          joinedAt: p.createdAt,
          activeStudentsCount,
          totalEarned: earnings.totalEarned,
          earnedThisMonth: earnings.earnedThisMonth,
          lastEarningDate: earnings.lastEarningDate,
          earningsByMonth: Object.entries(earnings.byMonth)
            .map(([month, total]) => ({ month, total }))
            .sort((a, b) => a.month.localeCompare(b.month)),
        };
      })
      .sort((a, b) => b.totalEarned - a.totalEarned);

    const globalByMonth: Record<string, number> = {};
    for (const e of allEarnings) {
      const monthKey = `${e.createdAt.getFullYear()}-${String(e.createdAt.getMonth() + 1).padStart(2, '0')}`;
      globalByMonth[monthKey] = (globalByMonth[monthKey] ?? 0) + e.earnedAmount;
    }

    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthKey = `${startOfLastMonth.getFullYear()}-${String(startOfLastMonth.getMonth() + 1).padStart(2, '0')}`;
    const currentMonthTotal = globalByMonth[currentMonthKey] ?? 0;
    const lastMonthTotal = globalByMonth[lastMonthKey] ?? 0;
    const estimatedMrr = lastMonthTotal;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (lastMonthTotal > 0 && currentMonthTotal > 0) {
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const projectedCurrent = Math.round(currentMonthTotal * (daysInMonth / dayOfMonth));
      if (projectedCurrent > lastMonthTotal * 1.05) trend = 'up';
      else if (projectedCurrent < lastMonthTotal * 0.95) trend = 'down';
    }

    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const earningsByMonth = monthKeys.map((month) => ({
      month,
      total: globalByMonth[month] ?? 0,
      label: new Date(`${month}-01`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    }));

    return {
      partners,
      projection: { currentMonthTotal, lastMonthTotal, estimatedMrr, trend, earningsByMonth },
    };
  }
}
