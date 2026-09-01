import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { AdminPartnersPayoutsService } from './admin-partners-payouts.service';
@ApiTags('admin-partners-payouts')
@ApiBearerAuth()
@Controller('admin/partners/:id/payouts')
export class AdminPartnersPayoutsController {
  constructor(private readonly service: AdminPartnersPayoutsService) {}
  @Get()
  @AdminOnly()
  listar(@Param('id') id: string) { return this.service.listar(id); }
  @Post()
  @AdminOnly()
  criar(@Param('id') id: string, @CurrentUser() user: SessionPayload) { return this.service.criar(id, user.id, user.name ?? user.email ?? 'Admin'); }
}
