import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminAffiliatesReservedService {
  constructor(private readonly prisma: PrismaService) {}
  async listar() {
    const earnings: any[] = await this.prisma.affiliateEarning.findMany({ where: { status: 'reserved' }, include: { affiliate: { include: { user: { select: { id: true, name: true, email: true } } } } }, orderBy: { createdAt: 'desc' } });
    const totalReserved = earnings.reduce((s: number, e: any) => s + e.earnedAmount, 0);
    return { earnings, totalReserved, count: earnings.length };
  }
  async resolver(body: any) {
    const { earningIds, action } = body;
    if (!earningIds?.length || !['release','cancel'].includes(action)) throw new BadRequestException({ error: 'earningIds[] e action (release|cancel) são obrigatórios' });
    const earnings: any[] = await this.prisma.affiliateEarning.findMany({ where: { id: { in: earningIds }, status: 'reserved' }, include: { affiliate: { select: { id: true, userId: true } } } });
    if (!earnings.length) throw new NotFoundException({ error: 'Nenhum earning reservado encontrado' });
    let processed = 0;
    for (const earning of earnings) {
      if (action === 'release') {
        await this.prisma.$transaction([
          this.prisma.affiliateEarning.update({ where: { id: earning.id }, data: { status: 'pending' } }),
          this.prisma.affiliateAccount.update({ where: { id: earning.affiliate.id }, data: { pendingBalance: { increment: earning.earnedAmount } } }),
          this.prisma.notification.create({ data: { userId: earning.affiliate.userId, type: 'AFFILIATE_COMMISSION', title: '💰 Comissão liberada!', message: `Uma comissão de R$ ${(earning.earnedAmount/100).toFixed(2)} liberada.`, link: '/dashboard/affiliate' } }),
        ] as any);
      } else {
        await this.prisma.$transaction([
          this.prisma.affiliateEarning.update({ where: { id: earning.id }, data: { status: 'cancelled' } }),
          this.prisma.notification.create({ data: { userId: earning.affiliate.userId, type: 'AFFILIATE_COMMISSION_REVERSED', title: '❌ Comissão cancelada', message: `Uma comissão de R$ ${(earning.earnedAmount/100).toFixed(2)} cancelada.`, link: '/dashboard/affiliate' } }),
        ] as any);
      }
      processed++;
    }
    return { success: true, action, processed, message: action === 'release' ? `${processed} comissão(ões) liberada(s)` : `${processed} comissão(ões) cancelada(s)` };
  }
}
