import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminFixStorageService } from './admin-fix-storage.service';
@ApiTags('admin-fix-storage')
@ApiBearerAuth()
@Controller('admin/fix-storage-provider')
export class AdminFixStorageController {
  constructor(private readonly service: AdminFixStorageService) {}
  @Post()
  @AdminOnly()
  fix() { return this.service.fix(); }
}
