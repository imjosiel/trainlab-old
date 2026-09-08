import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminPlatformFinanceService {
  constructor(private readonly prisma: PrismaService) {}
  async get() { const s = await this.prisma.platformFinanceSettings.findUnique({ where: { id: 'singleton' } }); return { settings: s ?? null }; }
  async update(body: any, actorId: string, actorName: string) {
    const { stripePercentFee, stripeFixedFeeInCents, distributionRules, usdToBrlRate } = body;
    if (distributionRules !== undefined) {
      if (!Array.isArray(distributionRules) || distributionRules.length > 20) throw new BadRequestException({ error: 'distributionRules deve ser array com no máximo 20' });
      for (const r of distributionRules as any[]) {
        const v = parseFloat(String(r.percentage ?? ''));
        if (!Number.isFinite(v) || v < 0 || v > 1) throw new BadRequestException({ error: `Percentual inválido: '${r.percentage}'` });
      }
      const total = (distributionRules as any[]).reduce((s, r) => s + parseFloat(String(r.percentage)), 0);
      if (Math.abs(total - 1.0) > 0.001) throw new BadRequestException({ error: `Soma deve ser 100%. Atual: ${(total * 100).toFixed(1)}%` });
    }
    if (stripePercentFee !== undefined) {
      const f = parseFloat(String(stripePercentFee));
      if (!Number.isFinite(f) || f < 0 || f > 0.1) throw new BadRequestException({ error: 'stripePercentFee deve estar entre 0 e 0.1' });
    }
    if (stripeFixedFeeInCents !== undefined) {
      const v = parseInt(String(stripeFixedFeeInCents), 10);
      if (!Number.isFinite(v) || v < 0 || v > 200) throw new BadRequestException({ error: 'stripeFixedFeeInCents deve estar entre 0 e 200' });
    }
    if (usdToBrlRate !== undefined) {
      const r = parseFloat(String(usdToBrlRate));
      if (!Number.isFinite(r) || r < 1 || r > 50) throw new BadRequestException({ error: 'usdToBrlRate deve estar entre 1 e 50' });
    }
    const settings = await this.prisma.platformFinanceSettings.upsert({
      where: { id: 'singleton' },
      create: { stripePercentFee: stripePercentFee !== undefined ? parseFloat(String(stripePercentFee)) : 0.0399, stripeFixedFeeInCents: stripeFixedFeeInCents !== undefined ? parseInt(String(stripeFixedFeeInCents), 10) : 39, usdToBrlRate: usdToBrlRate !== undefined ? parseFloat(String(usdToBrlRate)) : 5.85, distributionRules: (distributionRules as any[]) ?? [] },
      update: { stripePercentFee: stripePercentFee !== undefined ? parseFloat(String(stripePercentFee)) : undefined, stripeFixedFeeInCents: stripeFixedFeeInCents !== undefined ? parseInt(String(stripeFixedFeeInCents), 10) : undefined, usdToBrlRate: usdToBrlRate !== undefined ? parseFloat(String(usdToBrlRate)) : undefined, distributionRules: distributionRules !== undefined ? (distributionRules as any) : undefined },
    });
    await this.prisma.auditLog.create({ data: { actorId, actorName, action: 'SETTINGS_UPDATED', entity: 'PlatformFinanceSettings', entityId: 'singleton', details: { stripePercentFee, stripeFixedFeeInCents, usdToBrlRate, distributionRules } as any } }).catch(() => {});
    return { settings };
  }
}
