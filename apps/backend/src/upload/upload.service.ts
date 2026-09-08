import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
import { randomUUID } from 'crypto';
@Injectable()
export class UploadService {
  constructor(private readonly prisma: PrismaService) {}
  private isR2Configured(): boolean {
    return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
  }
  private getR2Client(): S3Client {
    return new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } });
  }
  private async getR2UploadUrl(key: string, contentType: string, expires = 900): Promise<string> {
    const client = this.getR2Client();
    const cmd = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key, ContentType: contentType });
    return getSignedUrl(client, cmd, { expiresIn: expires });
  }
  private buildExerciseKey(trainerId: string, uploadId: string, filename: string): string {
    return `exercises/${trainerId}/${uploadId}/${filename}`;
  }
  async presign(user: SessionPayload, body: any) {
    const isTrainer = (user.roles ?? []).includes('PROFESSIONAL');
    if (!isTrainer && !user.isAdmin) throw new ForbiddenException({ error: 'Apenas treinadores podem fazer upload' });
    if (!user.isAdmin) {
      const acc: any = await this.prisma.partnerAccount.findUnique({ where: { userId: user.id }, select: { status: true } }).catch(() => null);
      const hasSub = ['active','trialing','past_due'].includes((user as any).subscriptionStatus ?? '');
      if (acc?.status !== 'approved' && !hasSub) throw new ForbiddenException({ error: 'Você precisa ser parceiro aprovado ou ter assinatura ativa' });
    }
    if (!this.isR2Configured()) throw new ServiceUnavailableException({ error: 'R2 não configurado' });
    const files: any[] = body.files ?? [];
    if (!Array.isArray(files) || files.length === 0) throw new ForbiddenException({ error: 'Lista de arquivos ausente.' });
    if (files.length > 20) throw new ForbiddenException({ error: 'Máximo de 20 arquivos por batch.' });
    const ALLOWED = new Set(['video/mp4','video/webm','video/quicktime','video/x-msvideo','video/x-matroska','image/jpeg','image/png','image/webp']);
    const invalid = files.find((f) => f.type && !ALLOWED.has(f.type));
    if (invalid) throw new ForbiddenException({ error: `Tipo não permitido: ${invalid.type}` });
    const uploadId = randomUUID();
    const trainerId = user.id;
    const presignedFiles = await Promise.all(files.map(async ({ field, name, type }: any) => {
      const safeName = (name ?? 'file').replace(/[/\\..]+/g, '_').substring(0, 100);
      const key = this.buildExerciseKey(trainerId, uploadId, safeName);
      const url = await this.getR2UploadUrl(key, type ?? 'video/mp4', 900);
      return { field, key, url };
    }));
    return { uploadId, trainerId, files: presignedFiles };
  }
}
