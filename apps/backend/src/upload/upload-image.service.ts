import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
@Injectable()
export class UploadImageService {
  constructor(private readonly prisma: PrismaService) {}
  private isR2Configured(): boolean {
    return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
  }
  async upload(user: SessionPayload, file: any) {
    const isTrainer = (user.roles ?? []).includes('PROFESSIONAL');
    if (!isTrainer && !user.isAdmin) throw new ForbiddenException({ error: 'Apenas treinadores podem fazer upload.' });
    if (!user.isAdmin) {
      const acc: any = await this.prisma.partnerAccount.findUnique({ where: { userId: user.id }, select: { status: true } }).catch(() => null);
      const hasSub = ['active','trialing','past_due','canceling'].includes((user as any).subscriptionStatus ?? '');
      if (acc?.status !== 'approved' && !hasSub) throw new ForbiddenException({ error: 'Assinatura inativa.' });
    }
    if (!this.isR2Configured()) throw new ServiceUnavailableException({ error: 'R2 não configurado.' });
    const ALLOWED: any = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
    const ext = ALLOWED[file.mimetype];
    if (!ext) throw new ForbiddenException({ error: 'Tipo de arquivo não permitido.' });
    if (file.size > 5 * 1024 * 1024) throw new ForbiddenException({ error: 'Imagem muito grande. Máximo 5MB.' });
    const key = `exercise-images/${user.id}/${randomUUID()}.${ext}`;
    const client = new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } });
    await client.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key, Body: file.buffer, ContentType: file.mimetype }));
    const publicBase = process.env.R2_PUBLIC_BASE_URL ?? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}`;
    const url = `${publicBase}/${key}`;
    return { url };
  }
}
