import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '@/prisma/prisma.service';
@Injectable()
export class AdminCloudinaryService {
  constructor(private readonly prisma: PrismaService) {}
  async get(date?: string) {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) throw new ServiceUnavailableException({ error: 'Cloudinary não configurado.' });
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
    const usage: any = await cloudinary.api.usage();
    let historical: any = null;
    if (date) try { historical = await cloudinary.api.usage({ date }); } catch {}
    const breakdown = {
      storage: parseFloat(((usage.storage?.usage ?? 0) / 1e9).toFixed(3)),
      bandwidth: parseFloat(((usage.bandwidth?.usage ?? 0) / 1e9).toFixed(3)),
      transformations: parseFloat(((usage.transformations?.usage ?? 0) / 1000).toFixed(3)),
      video: parseFloat(((usage.video_processing?.usage ?? 0) / 500).toFixed(3)),
      total: 0,
    };
    (breakdown as any).total = parseFloat((breakdown.storage + breakdown.bandwidth + breakdown.transformations + breakdown.video).toFixed(3));
    const creditLimit = usage.credits?.limit ?? 25;
    const estimatedCostUSD = (usage.credits?.usage ?? breakdown.total) > creditLimit ? parseFloat((((usage.credits?.usage ?? breakdown.total) - creditLimit) * 1.49).toFixed(2)) : 0;
    const now = new Date();
    try {
      await this.prisma.cloudinarySnapshot.upsert({ where: { year_month: { year: now.getFullYear(), month: now.getMonth() + 1 } }, create: { year: now.getFullYear(), month: now.getMonth() + 1, creditsUsed: usage.credits?.usage ?? breakdown.total, creditsLimit: creditLimit, breakdown: breakdown as any, estimatedCostUSD }, update: { creditsUsed: usage.credits?.usage ?? breakdown.total, creditsLimit: creditLimit, breakdown: breakdown as any, estimatedCostUSD, capturedAt: now } });
    } catch {}
    const snapshots = await this.prisma.cloudinarySnapshot.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 3 });
    return { plan: usage.plan, credits: { used: usage.credits?.usage ?? breakdown.total, limit: creditLimit }, estimatedCostUSD, usageHistory: snapshots, historical };
  }
}
