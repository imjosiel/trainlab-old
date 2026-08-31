import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { UploadService } from './upload.service';
@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly service: UploadService) {}
  @Post('r2-presign')
  presign(@CurrentUser() user: SessionPayload, @Body() body: any) { return this.service.presign(user, body); }
}
