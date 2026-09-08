import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}
  async listar() {
    const reports = await this.prisma.monthlyReport.findMany({ orderBy: { period: 'desc' }, take: 60, include: { expenses: true, distributions: true } });
    return { reports };
  }
  async gerar(period: string, actorId: string, actorName: string) {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new BadRequestException({ error: 'Período inválido. Use formato YYYY-MM.' });
    const existing: any = await this.prisma.monthlyReport.findUnique({ where: { period } });
    if (existing?.status === 'published') throw new BadRequestException({ error: 'Relatório já publicado. Não pode ser regerado.' });
    const fin: any = await this.prisma.platformFinanceSettings.findUnique({ where: { id: 'singleton' } });
    const stripePercent = fin?.stripePercentFee ?? 0.0399;
    const stripeFixed = fin?.stripeFixedFeeInCents ?? 39;
    const rules: any[] = (fin?.distributionRules ?? []) as any[];
    const subs: any[] = await this.prisma.partnerSubscription.findMany({ where: { status: 'active' }, take: 10000, include: { offer: { include: { partner: { include: { tier: { select: { commissionRate: true } } } } } } } });
    const activeCount = subs.length;
    const grossRevenue = subs.reduce((s, sub) => s + Number(sub.offer?.price ?? 0), 0);
    const stripeFeePercentAmt = grossRevenue * stripePercent;
    const stripeFeeFixedAmt = (activeCount * stripeFixed) / 100;
    const partnerCommissions = subs.reduce((sum, s: any) => {
      const rate = s.offer?.partner?.customCommissionRate ?? s.offer?.partner?.tier?.commissionRate ?? s.offer?.partner?.commissionRate ?? 0;
      return sum + Number(s.offer?.price ?? 0) * (1 - rate);
    }, 0);
    const totalExpenses = stripeFeePercentAmt + stripeFeeFixedAmt + partnerCommissions;
    const netRevenue = grossRevenue - totalExpenses;
    const distributions = rules.map((r: any) => ({ label: r.label, percentage: r.percentage, amount: netRevenue > 0 ? parseFloat((netRevenue * r.percentage).toFixed(2)) : 0 }));
    let report: any;
    if (existing) {
      report = await this.prisma.$transaction(async (tx: any) => {
        await tx.reportExpense.deleteMany({ where: { reportId: existing.id, description: { startsWith: '[AUTO]' } } });
        await tx.reportDistribution.deleteMany({ where: { reportId: existing.id } });
        return tx.monthlyReport.update({ where: { id: existing.id }, data: { grossRevenue, activeSubscriptions: activeCount, stripeFeePercent: parseFloat(stripeFeePercentAmt.toFixed(2)), stripeFeeFixed: parseFloat(stripeFeeFixedAmt.toFixed(2)), partnerCommissions: parseFloat(partnerCommissions.toFixed(2)), totalExpenses: parseFloat(totalExpenses.toFixed(2)), netRevenue: parseFloat(netRevenue.toFixed(2)), generatedAt: new Date(), distributions: { create: distributions } }, include: { expenses: true, distributions: true } });
      });
    } else {
      report = await this.prisma.monthlyReport.create({ data: { period, grossRevenue, activeSubscriptions: activeCount, stripeFeePercent: parseFloat(stripeFeePercentAmt.toFixed(2)), stripeFeeFixed: parseFloat(stripeFeeFixedAmt.toFixed(2)), partnerCommissions: parseFloat(partnerCommissions.toFixed(2)), totalExpenses: parseFloat(totalExpenses.toFixed(2)), netRevenue: parseFloat(netRevenue.toFixed(2)), distributions: { create: distributions } }, include: { expenses: true, distributions: true } });
    }
    await this.prisma.auditLog.create({ data: { actorId, actorName, action: existing ? 'REPORT_UPDATED' : 'REPORT_GENERATED', entity: 'MonthlyReport', entityId: report.id, details: { period, grossRevenue, netRevenue, activeCount } } }).catch(() => {});
    return { report };
  }
}
