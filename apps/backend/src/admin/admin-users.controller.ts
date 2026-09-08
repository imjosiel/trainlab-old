import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { AdminUsersQuery } from '@/common/dtos-admin';
import { AdminUsersService } from './admin-users.service';
@ApiTags('admin-users')
@ApiBearerAuth()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}
  @Get()
  @AdminOnly()
  listar(@Query() query: AdminUsersQuery) { return this.service.listar(query); }
}
