import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AdminPartnersService {
  constructor(private readonly prisma: PrismaService) {}
  async listar(page = 1) {
    const PAGE_SIZE = 50;
    const p = Math.max(1, page);
    const skip = (p - 1) * PAGE_SIZE;
    const [partners, total] = await Promise.all([
      this.prisma.partnerAccount.findMany({ include: { user: { select: { id: true, name: true, email: true, image: true, systemRoles: true } } }, orderBy: { createdAt: 'desc' }, take: PAGE_SIZE, skip }),
      this.prisma.partnerAccount.count(),
    ]);
    return { partners, total, page: p, pages: Math.ceil(total / PAGE_SIZE) };
  }
}
