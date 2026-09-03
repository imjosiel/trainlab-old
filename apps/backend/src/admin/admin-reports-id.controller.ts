import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { ReportExpensesBody } from '@/common/dtos-admin';
import { AdminReportsIdService } from './admin-reports-id.service';
@ApiTags('admin-reports-id')
@ApiBearerAuth()
@Controller('admin/reports/:id')
export class AdminReportsIdController {
  constructor(private readonly service: AdminReportsIdService) {}
  @Get()
  @AdminOnly()
  get(@Param('id') id: string) { return this.service.get(id); }
  @Put()
  @AdminOnly()
  update(@Param('id') id: string, @Body() body: ReportExpensesBody) { return this.service.update(id, body); }
}
