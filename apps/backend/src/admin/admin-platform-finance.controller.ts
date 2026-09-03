import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { PlatformFinanceBody } from '@/common/dtos-admin';
import { AdminPlatformFinanceService } from './admin-platform-finance.service';
@ApiTags('admin-platform-finance')
@ApiBearerAuth()
@Controller('admin/platform-finance-settings')
export class AdminPlatformFinanceController {
  constructor(private readonly service: AdminPlatformFinanceService) {}
  @Get()
  @AdminOnly()
  get() { return this.service.get(); }
  @Put()
  @AdminOnly()
  update(@Body() body: PlatformFinanceBody, @CurrentUser() user: SessionPayload) { return this.service.update(body, user.id, user.name ?? user.email ?? 'Admin'); }
}
