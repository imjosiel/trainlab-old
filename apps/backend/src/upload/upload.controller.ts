import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { UploadPresignBody } from '@/common/dtos';
import { UploadService } from './upload.service';
@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly service: UploadService) {}
  @Post('r2-presign')
  @Throttle({ default: { limit: 30, ttl: 300_000 } })
  presign(@CurrentUser() user: SessionPayload, @Body() body: UploadPresignBody) { return this.service.presign(user, body); }
}
