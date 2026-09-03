import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AuditLogsQuery } from '@/common/dtos-admin';
import { AdminAuditLogsService } from './admin-audit-logs.service';
@ApiTags('admin-audit-logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly service: AdminAuditLogsService) {}
  @Get()
  @AdminOnly()
  listar(@Query() query: AuditLogsQuery) { return this.service.listar(query); }
}
