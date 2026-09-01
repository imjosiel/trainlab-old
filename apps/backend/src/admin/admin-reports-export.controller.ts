import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminReportsExportService } from './admin-reports-export.service';
@ApiTags('admin-reports-export')
@ApiBearerAuth()
@Controller('admin/reports/:id/export')
export class AdminReportsExportController {
  constructor(private readonly service: AdminReportsExportService) {}
  @Get()
  @AdminOnly()
  async export(@Param('id') id: string, @Res() res: any) {
    const { csv, filename } = await this.service.export(id);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(csv);
  }
}
