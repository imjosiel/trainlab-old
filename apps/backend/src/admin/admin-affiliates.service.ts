import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminAffiliatesService {
  constructor(private readonly prisma: PrismaService) {}
  async listar(page = 1) {
    const PAGE_SIZE = 50;
    const p = Math.max(1, page);
    const skip = (p - 1) * PAGE_SIZE;
    const [affiliates, total] = await Promise.all([
      this.prisma.affiliateAccount.findMany({ include: { user: { select: { id: true, name: true, email: true, image: true } }, _count: { select: { referredPartners: true, earnings: true } } }, orderBy: { createdAt: 'desc' }, take: PAGE_SIZE, skip }),
      this.prisma.affiliateAccount.count(),
    ]);
    return { affiliates, total, page: p, pages: Math.ceil(total / PAGE_SIZE) };
  }
}
