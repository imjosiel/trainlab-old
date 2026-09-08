import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminUsersReportService } from './admin-users-report.service';
@ApiTags('admin-users-report')
@ApiBearerAuth()
@Controller('admin/users/:id/report')
export class AdminUsersReportController {
  constructor(private readonly service: AdminUsersReportService) {}
  @Get()
  @AdminOnly()
  get(@Param('id') id: string) { return this.service.get(id); }
}
