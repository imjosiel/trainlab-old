import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminPartnersService } from './admin-partners.service';

@ApiTags('admin-partners')
@ApiBearerAuth()
@Controller('admin/partners')
export class AdminPartnersController {
  constructor(private readonly service: AdminPartnersService) {}
  @Get()
  @AdminOnly()
  listar(@Query('page') page?: string) {
    return this.service.listar(parseInt(page ?? '1', 10) || 1);
  }
}
