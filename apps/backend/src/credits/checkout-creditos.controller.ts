import { Body, Controller, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { CheckoutCreditosBody, CreditsService } from './credits.service';

@ApiTags('credits')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autenticado.' } } })
@Controller('stripe/checkout-credits')
export class CheckoutCreditosController {
  constructor(private readonly credits: CreditsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria sessão Stripe (pagamento único) para compra de um pacote de créditos.' })
  @ApiBadRequestResponse({ schema: { example: { error: 'packageId é obrigatório.' } } })
  @ApiForbiddenResponse({ schema: { example: { error: 'Sistema de créditos desativado.' } } })
  @ApiNotFoundResponse({ schema: { example: { error: 'Pacote não encontrado ou inativo.' } } })
  criar(@CurrentUser() user: SessionPayload, @Body() body: CheckoutCreditosBody) {
    return this.credits.criarCheckout(user, body);
  }
}
