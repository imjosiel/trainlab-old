import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '@/prisma/prisma.service';
import { SessionPayload } from '@/auth/session-payload';
@Injectable()
export class UploadCloudinaryService {
  constructor(private readonly prisma: PrismaService) {}
  async getSignature(user: SessionPayload) {
    if (!user?.id) throw new UnauthorizedException({ error: 'Não autenticado.' });
    const isTrainer = (user.roles ?? []).includes('PROFESSIONAL');
    if (!isTrainer && !user.isAdmin) throw new ForbiddenException({ error: 'Apenas treinadores podem fazer upload.' });
    if (!user.isAdmin) {
      const acc: any = await this.prisma.partnerAccount.findUnique({ where: { userId: user.id }, select: { status: true } }).catch(() => null);
      const hasSub = ['active','trialing','past_due'].includes((user as any).subscriptionStatus ?? '');
      if (acc?.status !== 'approved' && !hasSub) throw new ForbiddenException({ error: 'Você precisa ser parceiro aprovado ou ter assinatura ativa.' });
    }
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
    const folder = 'player_action_b2b_exercises';
    const context = `uploader=${user.id}`;
    const timestamp = Math.round(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request({ timestamp, folder, context, allowed_formats: 'mp4,webm,mov,avi,mkv' }, process.env.CLOUDINARY_API_SECRET!);
    return { timestamp, signature, folder, context, cloudName: process.env.CLOUDINARY_CLOUD_NAME };
  }
}
