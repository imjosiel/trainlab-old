import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminVideoProcessorService {
  constructor(private readonly prisma: PrismaService) {}
  async listar() {
    const pending: any[] = await this.prisma.exercise.findMany({ where: { hlsProcessed: false, videoStorageProvider: 'r2', originalVideoKey: { not: null } }, select: { id: true, name: true, videoUrl: true, videoPublicId: true, originalVideoKey: true, trainerId: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 200 });
    if (!pending.length) return { pending, total: 0 };
    const trainerIds = Array.from(new Set(pending.map((ex: any) => ex.trainerId).filter((id: any) => !!id))) as string[];
    const partnerAccounts: any[] = await this.prisma.partnerAccount.findMany({ where: { userId: { in: trainerIds } }, select: { userId: true, tierId: true } });
    const tierIdByTrainer: Record<string, string | null> = Object.fromEntries(partnerAccounts.map((a: any) => [a.userId, a.tierId]));
    const partnerTierIds = Array.from(new Set(partnerAccounts.map((a: any) => a.tierId).filter((id: any) => !!id)));
    const partnerTiers: any[] = partnerTierIds.length ? await this.prisma.partnerTier.findMany({ where: { id: { in: partnerTierIds } }, select: { id: true, videoQualityHeights: true } }) : [];
    const qualityByPartnerTierId: Record<string, number[]> = Object.fromEntries(partnerTiers.map((t: any) => [t.id, t.videoQualityHeights ?? []]));
    const nonPartnerTrainerIds = trainerIds.filter((tid) => !tierIdByTrainer[tid]);
    const subscriptions: any[] = nonPartnerTrainerIds.length ? await this.prisma.userSubscription.findMany({ where: { userId: { in: nonPartnerTrainerIds } }, select: { userId: true, plan: true } }) : [];
    const planByTrainer: Record<string, string> = Object.fromEntries(subscriptions.map((s: any) => [s.userId, s.plan]));
    const planNames = Array.from(new Set(subscriptions.map((s: any) => s.plan).filter(Boolean))) as string[];
    const saasTiers: any[] = planNames.length ? await this.prisma.saaSTier.findMany({ where: { name: { in: planNames as any } }, select: { name: true, videoQualityHeights: true } }) : [];
    const qualityByPlan: Record<string, number[]> = Object.fromEntries(saasTiers.map((t: any) => [t.name, t.videoQualityHeights ?? []]));
    const enriched = pending.map((ex: any) => {
      const tid = ex.trainerId ?? '';
      const partnerTierId = tierIdByTrainer[tid];
      const videoQualityHeights = partnerTierId != null ? (qualityByPartnerTierId[partnerTierId] ?? []) : (qualityByPlan[planByTrainer[tid] ?? ''] ?? []);
      return { ...ex, videoQualityHeights };
    });
    return { pending: enriched, total: enriched.length };
  }
  async atualizar(body: any) {
    const { id, hlsProcessed, originalVideoKey, processingProgress } = body;
    if (!id) throw new Error('id obrigatório.');
    const data: any = {};
    if (typeof processingProgress === 'number') data.processingProgress = Math.min(100, Math.max(0, processingProgress));
    if (hlsProcessed === true) { data.hlsProcessed = true; data.processingProgress = 100; if (originalVideoKey) data.originalVideoKey = originalVideoKey; }
    if (!Object.keys(data).length) throw new Error('Nenhum dado para atualizar.');
    const updated = await this.prisma.exercise.update({ where: { id }, data, select: { id: true, name: true, hlsProcessed: true, processingProgress: true } });
    return { updated };
  }
}
