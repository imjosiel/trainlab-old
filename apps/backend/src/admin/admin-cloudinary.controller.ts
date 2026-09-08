import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminCloudinaryService } from './admin-cloudinary.service';
@ApiTags('admin-cloudinary')
@ApiBearerAuth()
@Controller('admin/cloudinary-usage')
export class AdminCloudinaryController {
  constructor(private readonly service: AdminCloudinaryService) {}
  @Get()
  @AdminOnly()
  get(@Query('date') date?: string) { return this.service.get(date); }
}
