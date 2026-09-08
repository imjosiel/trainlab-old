import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminFixStorageService {
  constructor(private readonly prisma: PrismaService) {}
  async fix() {
    const wronglyTagged: any[] = await this.prisma.exercise.findMany({ where: { videoStorageProvider: 'r2', videoUrl: { not: null }, NOT: { videoUrl: { startsWith: '/api/videos/' } } }, select: { id: true, name: true, videoUrl: true, videoPublicId: true }, take: 1000 });
    if (!wronglyTagged.length) return { fixed: 0, message: 'Nenhum exercício incorreto encontrado.' };
    await this.prisma.exercise.updateMany({ where: { id: { in: wronglyTagged.map((e: any) => e.id) } }, data: { videoStorageProvider: 'cloudinary', hlsProcessed: false, originalVideoKey: null } });
    return { fixed: wronglyTagged.length, exercises: wronglyTagged.map((e: any) => ({ id: e.id, name: e.name, videoUrl: e.videoUrl })), message: `${wronglyTagged.length} exercício(s) corrigido(s) para 'cloudinary'.` };
  }
}
