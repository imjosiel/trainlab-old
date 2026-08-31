import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminR2StorageService } from './admin-r2-storage.service';
@ApiTags('admin-r2-storage')
@ApiBearerAuth()
@Controller('admin/r2-storage')
export class AdminR2StorageController {
  constructor(private readonly service: AdminR2StorageService) {}
  @Get()
  @AdminOnly()
  get() { return this.service.get(); }
}
