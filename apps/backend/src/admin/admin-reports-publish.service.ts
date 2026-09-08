import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminReportsPublishService {
  constructor(private readonly prisma: PrismaService) {}
  async publish(id: string, actorId: string, actorName: string) {
    const report: any = await this.prisma.monthlyReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException({ error: 'Relatório não encontrado.' });
    if (report.status === 'published') throw new BadRequestException({ error: 'Relatório já publicado.' });
    const updated: any = await this.prisma.monthlyReport.update({ where: { id }, data: { status: 'published', publishedAt: new Date() }, include: { expenses: true, distributions: true } });
    await this.prisma.auditLog.create({ data: { actorId, actorName, action: 'REPORT_PUBLISHED', entity: 'MonthlyReport', entityId: updated.id, details: { period: updated.period, grossRevenue: updated.grossRevenue, netRevenue: updated.netRevenue } as any } }).catch(()=>{});
    return { report: updated };
  }
}
