import { Controller, Get, Param, Req, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
@ApiTags('videos')
@ApiBearerAuth()
@Controller('videos')
export class VideosController {
  private getR2Client(): S3Client {
    return new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } });
  }
  private async getR2DownloadUrl(key: string, expires = 7200): Promise<string> {
    const client = this.getR2Client();
    const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key });
    return getSignedUrl(client, cmd, { expiresIn: expires });
  }
  @Get('*path')
  async get(@Param('path') path: string[], @Req() req: any, @Headers('accept') accept?: string) {
    const INVALID = /^\\.{1,2}$|[\\<>:"|?*\x00-\x1f]/;
    if (path.some((seg) => INVALID.test(seg) || seg.includes('/'))) return { error: 'Caminho inválido.' };
    const key = path.join('/');
    if (!key.startsWith('exercises/')) return { error: 'Acesso negado.' };
    const url = await this.getR2DownloadUrl(key, 7200);
    if ((accept ?? '').includes('application/json')) return { url };
    return { redirect: url };
  }
}
