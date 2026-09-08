import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminR2StorageService {
  constructor(private readonly prisma: PrismaService) {}
  async get() {
    const r2Where: any = { videoStorageProvider: 'r2', videoUrl: { not: null } };
    const [total, hlsDone] = await Promise.all([this.prisma.exercise.count({ where: r2Where }), this.prisma.exercise.count({ where: { ...r2Where, hlsProcessed: true } })]);
    const hlsPending = total - hlsDone;
    const all: any[] = await this.prisma.exercise.findMany({ where: r2Where, select: { id: true, name: true, hlsProcessed: true, videoPublicId: true, originalVideoKey: true, createdAt: true, trainer: { select: { id: true, name: true, image: true } } }, orderBy: { createdAt: 'desc' }, take: 2000 });
    const byTrainer: Record<string, any> = {};
    for (const ex of all) {
      const key = ex.trainer?.id ?? 'global';
      if (!byTrainer[key]) byTrainer[key] = { trainer: ex.trainer ?? { id: 'global', name: 'Exercícios Globais', image: null }, total: 0, done: 0, pending: 0 };
      byTrainer[key].total++;
      if (ex.hlsProcessed) byTrainer[key].done++; else byTrainer[key].pending++;
    }
    return { summary: { total, hlsDone, hlsPending }, byTrainer: Object.values(byTrainer).sort((a: any, b: any) => b.total - a.total), recent: all.slice(0, 50) };
  }
}
