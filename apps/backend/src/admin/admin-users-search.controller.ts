import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminUsersSearchService } from './admin-users-search.service';
@ApiTags('admin-users-search')
@ApiBearerAuth()
@Controller('admin/users/search')
export class AdminUsersSearchController {
  constructor(private readonly service: AdminUsersSearchService) {}
  @Get()
  @AdminOnly()
  buscar(@Query('email') email?: string) { return this.service.buscar(email); }
}
