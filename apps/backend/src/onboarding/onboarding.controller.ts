import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { OnboardingService } from './onboarding.service';
@ApiTags('onboarding')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}
  @Get()
  get(@CurrentUser() user: SessionPayload) { return this.service.get(user); }
  @Post()
  post(@CurrentUser() user: SessionPayload, @Body() body: any) { return this.service.post(user, body); }
}
