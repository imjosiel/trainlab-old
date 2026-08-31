import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminMetricsB2bService } from './admin-metrics-b2b.service';
@ApiTags('admin-metrics-b2b')
@ApiBearerAuth()
@Controller('admin/metrics/b2b')
export class AdminMetricsB2bController {
  constructor(private readonly service: AdminMetricsB2bService) {}
  @Get()
  @AdminOnly()
  get() { return this.service.get(); }
}
