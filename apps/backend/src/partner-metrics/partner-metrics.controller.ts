import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { PartnerMetricsService } from './partner-metrics.service';
@ApiTags('partner-metrics')
@ApiBearerAuth()
@Controller('partner/metrics')
export class PartnerMetricsController {
  constructor(private readonly service: PartnerMetricsService) {}
  @Get()
  get(@CurrentUser() user: SessionPayload) { return this.service.get(user); }
}
