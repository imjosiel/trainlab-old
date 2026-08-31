import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { AdminPartnersService } from './admin-partners.service';
import { AdminPartnersActionsService } from './admin-partners-actions.service';

@ApiTags('admin-partners')
@ApiBearerAuth()
@Controller('admin/partners')
export class AdminPartnersController {
  constructor(private readonly service: AdminPartnersService, private readonly actions: AdminPartnersActionsService) {}
  @Get()
  @AdminOnly()
  listar(@Query('page') page?: string) {
    return this.service.listar(parseInt(page ?? '1', 10) || 1);
  }
  @Patch(':id')
  @AdminOnly()
  atualizar(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body() body: any) {
    return this.actions.atualizar(id, user.id, body);
  }
}
