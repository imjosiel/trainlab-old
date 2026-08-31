import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminAffiliatesService } from './admin-affiliates.service';
@ApiTags('admin-affiliates')
@ApiBearerAuth()
@Controller('admin/affiliates')
export class AdminAffiliatesController {
  constructor(private readonly service: AdminAffiliatesService) {}
  @Get()
  @AdminOnly()
  listar(@Query('page') page?: string) { return this.service.listar(parseInt(page ?? '1', 10) || 1); }
}
