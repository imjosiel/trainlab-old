import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { UploadImageService } from './upload-image.service';
@ApiTags('upload-image')
@ApiBearerAuth()
@Controller('upload')
export class UploadImageController {
  constructor(private readonly service: UploadImageService) {}
  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  upload(@CurrentUser() user: SessionPayload, @UploadedFile() file: any) {
    return this.service.upload(user, file);
  }
}
