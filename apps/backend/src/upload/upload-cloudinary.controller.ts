import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { UploadCloudinaryService } from './upload-cloudinary.service';
@ApiTags('upload-cloudinary')
@ApiBearerAuth()
@Controller('upload')
export class UploadCloudinaryController {
  constructor(private readonly service: UploadCloudinaryService) {}
  @Post()
  getSignature(@CurrentUser() user: SessionPayload) { return this.service.getSignature(user); }
}
