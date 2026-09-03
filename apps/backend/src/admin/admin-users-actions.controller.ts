import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { AdminUsersActionBody } from '@/common/dtos-admin';
import { AdminUsersActionsService } from './admin-users-actions.service';
@ApiTags('admin-users-actions')
@ApiBearerAuth()
@Controller('admin/users/:id')
export class AdminUsersActionsController {
  constructor(private readonly service: AdminUsersActionsService) {}
  @Patch()
  @AdminOnly()
  atualizar(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body() body: AdminUsersActionBody) { return this.service.atualizar(id, user as any, body); }
  @Delete()
  async remover(@Param('id') id: string, @CurrentUser() user: SessionPayload) { return this.service.remover(id, user as any); }
}
