import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminOverviewService } from './admin-overview.service';
@ApiTags('admin-overview')
@ApiBearerAuth()
@Controller('admin/overview')
export class AdminOverviewController {
  constructor(private readonly service: AdminOverviewService) {}
  @Get()
  @AdminOnly()
  get() { return this.service.get(); }
}
