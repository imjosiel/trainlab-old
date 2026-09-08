import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminReportsIdService {
  constructor(private readonly prisma: PrismaService) {}
  async get(id: string) {
    const report: any = await this.prisma.monthlyReport.findUnique({ where: { id }, include: { expenses: true, distributions: true } });
    if (!report) throw new NotFoundException({ error: 'Relatório não encontrado.' });
    return { report };
  }
  async update(id: string, body: any) {
    const report: any = await this.prisma.monthlyReport.findUnique({ where: { id }, include: { expenses: true, distributions: true } });
    if (!report) throw new NotFoundException({ error: 'Relatório não encontrado.' });
    if (report.status === 'published') throw new BadRequestException({ error: 'Relatório publicado não pode ser editado.' });
    const { expenses } = body;
    await this.prisma.reportExpense.deleteMany({ where: { reportId: id } });
    if (expenses?.length) {
      const capped = expenses.slice(0, 100);
      await this.prisma.reportExpense.createMany({ data: capped.map((e: any) => ({ reportId: id, category: String(e.category ?? 'other'), description: typeof e.description === 'string' ? e.description.slice(0, 200) : '', amount: Math.max(0, parseFloat(String(e.amount ?? '0')) || 0) })) });
    }
    const totalManual = (expenses ?? []).reduce((s: number, e: any) => s + (parseFloat(String(e.amount ?? '0')) || 0), 0);
    const autoExpenses = report.stripeFeePercent + report.stripeFeeFixed + report.partnerCommissions;
    const totalExpenses = autoExpenses + totalManual;
    const netRevenue = report.grossRevenue - totalExpenses;
    const fin: any = await this.prisma.platformFinanceSettings.findUnique({ where: { id: 'singleton' } });
    const rules: any[] = (fin?.distributionRules ?? []) as any[];
    await this.prisma.reportDistribution.deleteMany({ where: { reportId: id } });
    if (rules.length) await this.prisma.reportDistribution.createMany({ data: rules.map((r: any) => ({ reportId: id, label: r.label, percentage: r.percentage, amount: netRevenue > 0 ? parseFloat((netRevenue * r.percentage).toFixed(2)) : 0 })) });
    const updated: any = await this.prisma.monthlyReport.update({ where: { id }, data: { totalExpenses: parseFloat(totalExpenses.toFixed(2)), netRevenue: parseFloat(netRevenue.toFixed(2)) }, include: { expenses: true, distributions: true } });
    return { report: updated };
  }
}
