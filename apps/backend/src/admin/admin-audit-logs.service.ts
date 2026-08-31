import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}
  async listar(query: any) {
    const entity = query.entity?.substring(0, 60) ?? undefined;
    const action = query.action?.substring(0, 60) ?? undefined;
    const actorId = query.actorId?.substring(0, 60) ?? undefined;
    const search = query.search?.substring(0, 100) ?? undefined;
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(100, parseInt(query.limit ?? '50', 10) || 50);
    const skip = (page - 1) * limit;
    const where: any = { ...(entity && { entity }), ...(action && { action }), ...(actorId && { actorId }), ...(search && { OR: [{ actorName: { contains: search, mode: 'insensitive' } }, { action: { contains: search, mode: 'insensitive' } }, { entity: { contains: search, mode: 'insensitive' } }, { entityId: { contains: search, mode: 'insensitive' } }] }) };
    const includeFilters = query.includeFilters !== 'false' && page === 1;
    const [logs, total, entities, actors] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { performedAt: 'desc' }, skip, take: limit }),
      this.prisma.auditLog.count({ where }),
      includeFilters ? this.prisma.auditLog.findMany({ select: { entity: true }, distinct: ['entity'], orderBy: { entity: 'asc' }, take: 200 }) : Promise.resolve([]),
      includeFilters ? this.prisma.auditLog.findMany({ select: { actorId: true, actorName: true }, distinct: ['actorId'], orderBy: { actorName: 'asc' }, take: 200 }) : Promise.resolve([]),
    ]);
    return { logs, total, page, pages: Math.ceil(total / limit), filters: { entities: (entities as any[]).map((e: any) => e.entity), actors: (actors as any[]).map((a: any) => ({ id: a.actorId, name: a.actorName })) } };
  }
}
