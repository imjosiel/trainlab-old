import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { VideosController } from './videos.controller';
@Module({ controllers: [UploadController, VideosController], providers: [UploadService] })
export class UploadModule {}
