import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminAuditLogsService } from './admin-audit-logs.service';
@ApiTags('admin-audit-logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly service: AdminAuditLogsService) {}
  @Get()
  @AdminOnly()
  listar(@Query() query: any) { return this.service.listar(query); }
}
