import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}
  async listar(query: any) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));
    const search = (query.search ?? '').substring(0, 100);
    const roleFilter = query.role ?? 'ALL';
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }];
    if (roleFilter !== 'ALL') {
      if (['ADMIN','MODERATOR','PARTNER','USER'].includes(roleFilter)) where.systemRoles = { has: roleFilter };
      else where.roles = { has: roleFilter };
    }
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, email: true, image: true, roles: true, systemRoles: true, createdAt: true, subscription: { select: { plan: true, status: true } }, accounts: { select: { provider: true } }, partnerAccount: { select: { id: true, partnerTier: true } } } }),
      this.prisma.user.count({ where }),
    ]);
    return { users, pagination: { total, pages: Math.ceil(total / limit), currentPage: page, limit } };
  }
}
