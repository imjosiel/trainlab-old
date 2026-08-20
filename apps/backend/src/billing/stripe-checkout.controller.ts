import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { Public } from '@/auth/public.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { CheckoutB2BBody, CheckoutTierBody, PortalBody, StripeCheckoutService } from './stripe-checkout.service';

@ApiTags('stripe')
@Controller('stripe')
export class StripeCheckoutController {
  constructor(private readonly checkout: StripeCheckoutService) {}

  @Public()
  @Post('checkout-b2b')
  @ApiOperation({ summary: 'Checkout de uma oferta de parceiro — suporta guest (sem login).' })
  checkoutB2B(@CurrentUser() user: SessionPayload | undefined, @Body() body: CheckoutB2BBody) {
    return this.checkout.checkoutB2B(user ?? null, body);
  }

  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
  @Post('checkout-partner-tier')
  @ApiOperation({ summary: 'Checkout para o parceiro fazer upgrade de tier pago.' })
  checkoutPartnerTier(@CurrentUser() user: SessionPayload, @Body() body: CheckoutTierBody) {
    return this.checkout.checkoutTierDoParceiro(user, body);
  }

  @Public()
  @Get('checkout-status/:sessionId')
  @ApiOperation({ summary: 'Status de qualquer sessão de checkout Stripe — dono ou admin.' })
  statusDoCheckout(@Param('sessionId') sessionId: string, @CurrentUser() user: SessionPayload | undefined) {
    return this.checkout.statusDoCheckout(sessionId, user ?? null);
  }

  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
  @Post('portal')
  @ApiOperation({ summary: 'Abre o Customer Portal da Stripe pro requisitante.' })
  portal(@CurrentUser() user: SessionPayload, @Body() body: PortalBody) {
    return this.checkout.criarSessaoDoPortal(user, body);
  }
}
