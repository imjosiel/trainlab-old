import { Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '@/auth/admin-only.decorator';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { AdminReportsPublishService } from './admin-reports-publish.service';
@ApiTags('admin-reports-publish')
@ApiBearerAuth()
@Controller('admin/reports/:id/publish')
export class AdminReportsPublishController {
  constructor(private readonly service: AdminReportsPublishService) {}
  @Post()
  @AdminOnly()
  publish(@Param('id') id: string, @CurrentUser() user: SessionPayload) { return this.service.publish(id, user.id, user.name ?? user.email ?? 'Admin'); }
}
