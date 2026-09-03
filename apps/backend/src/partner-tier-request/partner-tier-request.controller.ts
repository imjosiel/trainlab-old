import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { TierRequestBody } from '@/common/dtos';
import { PartnerTierRequestService } from './partner-tier-request.service';
@ApiTags('partner-tier-request')
@ApiBearerAuth()
@Controller('partner/tier-request')
export class PartnerTierRequestController {
  constructor(private readonly service: PartnerTierRequestService) {}
  @Get()
  get(@CurrentUser() user: SessionPayload) { return this.service.get(user); }
  @Post()
  post(@CurrentUser() user: SessionPayload, @Body() body: TierRequestBody) { return this.service.post(user, body); }
}
