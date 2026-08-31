import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminSettingsService } from './admin-settings.service';
@ApiTags('admin-settings')
@ApiBearerAuth()
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly service: AdminSettingsService) {}
  @Get()
  listar() { return this.service.get(); }
  @Put()
  @AdminOnly()
  atualizar(@Body() body: any) { return this.service.update(body); }
}
