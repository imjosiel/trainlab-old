import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { PlanStatusService } from './plan-status.service';
@ApiTags('plan-status')
@ApiBearerAuth()
@Controller('user/plan-status')
export class PlanStatusController {
  constructor(private readonly service: PlanStatusService) {}
  @Get()
  get(@CurrentUser() user: SessionPayload) { return this.service.get(user); }
}
