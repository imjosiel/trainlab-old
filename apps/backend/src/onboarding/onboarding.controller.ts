import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { OnboardingBody } from '@/common/dtos';
import { OnboardingService } from './onboarding.service';
@ApiTags('onboarding')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}
  @Get()
  get(@CurrentUser() user: SessionPayload) { return this.service.get(user); }
  @Post()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  post(@CurrentUser() user: SessionPayload, @Body() body: OnboardingBody) { return this.service.post(user, body); }
}
