import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { AdminReportsService } from './admin-reports.service';
@ApiTags('admin-reports')
@ApiBearerAuth()
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly service: AdminReportsService) {}
  @Get()
  @AdminOnly()
  listar() { return this.service.listar(); }
  @Post()
  @AdminOnly()
  gerar(@Body() body: { period: string }, @CurrentUser() user: SessionPayload) { return this.service.gerar(body.period, user.id, user.name ?? user.email ?? 'Admin'); }
}
