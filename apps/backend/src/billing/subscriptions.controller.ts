import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { Public } from '@/auth/public.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { ROLES } from '@/common/constants';
import { CancelBody, CheckoutBody, ReactivateBody } from './dtos';
import { SubscriptionsService } from './subscriptions.service';

/** O que o aluno vê e faz com as próprias assinaturas B2B. */
@ApiTags('billing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('user/subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Assinaturas B2B ativas do requisitante.',
    description: 'Leitura pura (D80): não chama o Stripe, não escreve. A fonte de verdade é o webhook.',
  })
  listar(@CurrentUser() user: SessionPayload) {
    return this.subscriptions.listar(user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Reativa (desiste do cancelamento agendado) ou cancela um downgrade agendado.' })
  @ApiNotFoundResponse({ schema: { example: { error: 'Not Found' } } })
  reativar(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body() body: ReactivateBody) {
    return this.subscriptions.reativar(id, user, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancela (agenda para o fim do período) ou troca de plano.' })
  @ApiNotFoundResponse({ schema: { example: { error: 'Not Found' } } })
  cancelar(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body() body: CancelBody) {
    return this.subscriptions.cancelar(id, user, body);
  }
}

/** Checkout e verificação — a única rota B2B que aceita GUEST (D67-like). */
@ApiTags('billing')
@Controller('partner/offers/:id')
export class CheckoutController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Post('checkout')
  @ApiOperation({
    summary: 'Assina a oferta — trial, grátis ou pago.',
    description:
      'Sem `findFirst` antes de gravar (D78): o índice único parcial do banco decide a corrida, ' +
      'e P2002 vira 409, não corrida perdida.',
  })
  @ApiBadRequestResponse({ schema: { example: { error: 'Email é obrigatório.' } } })
  @ApiConflictResponse({ schema: { example: { error: 'Você já possui uma assinatura com este treinador.' } } })
  checkout(@Param('id') id: string, @CurrentUser() user: SessionPayload | undefined, @Body() body: CheckoutBody) {
    return this.subscriptions.checkout(id, user ?? null, body);
  }

  @Get('checkout/verify')
  @ApiOperation({
    summary: 'Confirma o checkout — fallback do webhook.',
    description: 'D81: perder a corrida para o webhook reconcilia, não vira 500.',
  })
  @ApiQuery({ name: 'session_id', required: true })
  verificar(@Param('id') _id: string, @CurrentUser() user: SessionPayload, @Query('session_id') sessionId?: string) {
    return this.subscriptions.verificarCheckout(sessionId ?? '', user);
  }
}

/** Assinantes das ofertas do parceiro. */
@ApiTags('billing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('partner/subscribers')
export class SubscribersController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Assinantes das ofertas do parceiro logado, paginado por cursor.' })
  @ApiForbiddenResponse({ schema: { example: { error: 'Parceiro não aprovado.' } } })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listar(@CurrentUser() user: SessionPayload, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    if (!user.roles?.includes(ROLES.PROFESSIONAL) && !user.isAdmin) {
      throw new ForbiddenException({ error: 'Parceiro não aprovado.' });
    }
    return this.subscriptions.listarAssinantes(user.id, { cursor, limit });
  }
}
