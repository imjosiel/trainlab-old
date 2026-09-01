import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { PartnerTierVerifyService } from './partner-tier-verify.service';
@ApiTags('partner-tier-verify')
@ApiBearerAuth()
@Controller('partner/tier-request/verify')
export class PartnerTierVerifyController {
  constructor(private readonly service: PartnerTierVerifyService) {}
  @Get()
  verificar(@CurrentUser() user: SessionPayload, @Query('session_id') sessionId: string) { return this.service.verificar(user, sessionId); }
}
