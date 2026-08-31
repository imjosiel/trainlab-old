import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminPartnersRevenueService } from './admin-partners-revenue.service';
@ApiTags('admin-partners-revenue')
@ApiBearerAuth()
@Controller('admin/partners/revenue')
export class AdminPartnersRevenueController {
  constructor(private readonly service: AdminPartnersRevenueService) {}
  @Get()
  @AdminOnly()
  get() { return this.service.get(); }
}
