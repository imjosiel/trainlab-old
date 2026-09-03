import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { SaasCheckoutBody } from '@/common/dtos';
import { SaasCheckoutService } from './saas-checkout.service';
@ApiTags('saas-checkout')
@ApiBearerAuth()
@Controller('stripe')
export class SaasCheckoutController {
  constructor(private readonly service: SaasCheckoutService) {}
  @Post('create-checkout')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  criar(@CurrentUser() user: SessionPayload, @Body() body: SaasCheckoutBody) { return this.service.criar(user, body); }
}
