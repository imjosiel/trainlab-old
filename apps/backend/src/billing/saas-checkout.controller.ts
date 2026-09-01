import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { SaasCheckoutService } from './saas-checkout.service';
@ApiTags('saas-checkout')
@ApiBearerAuth()
@Controller('stripe')
export class SaasCheckoutController {
  constructor(private readonly service: SaasCheckoutService) {}
  @Post('create-checkout')
  criar(@CurrentUser() user: SessionPayload, @Body() body: any) { return this.service.criar(user, body); }
}
