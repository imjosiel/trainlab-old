import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadImageController } from './upload-image.controller';
import { UploadImageService } from './upload-image.service';
import { UploadService } from './upload.service';
import { VideosController } from './videos.controller';
@Module({ controllers: [UploadController, UploadImageController, VideosController], providers: [UploadService, UploadImageService] })
export class UploadModule {}
