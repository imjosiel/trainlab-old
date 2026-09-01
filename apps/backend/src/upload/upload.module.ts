import { Module } from '@nestjs/common';
import { UploadCloudinaryController } from './upload-cloudinary.controller';
import { UploadCloudinaryService } from './upload-cloudinary.service';
import { UploadController } from './upload.controller';
import { UploadImageController } from './upload-image.controller';
import { UploadImageService } from './upload-image.service';
import { UploadService } from './upload.service';
import { VideosController } from './videos.controller';
@Module({ controllers: [UploadController, UploadImageController, UploadCloudinaryController, VideosController], providers: [UploadService, UploadImageService, UploadCloudinaryService] })
export class UploadModule {}
