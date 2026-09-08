import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminFinanceService } from './admin-finance.service';
@ApiTags('admin-finance')
@ApiBearerAuth()
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(private readonly service: AdminFinanceService) {}
  @Get()
  @AdminOnly()
  get() { return this.service.get(); }
}
