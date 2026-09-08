import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { PartnerSettingsBody } from '@/common/dtos';
import { PartnerSettingsService } from './partner-settings.service';
@ApiTags('partner-settings')
@ApiBearerAuth()
@Controller('partner/settings')
export class PartnerSettingsController {
  constructor(private readonly service: PartnerSettingsService) {}
  @Get()
  get(@CurrentUser() user: SessionPayload) { return this.service.get(user); }
  @Patch()
  update(@CurrentUser() user: SessionPayload, @Body() body: PartnerSettingsBody) { return this.service.update(user, body); }
}
