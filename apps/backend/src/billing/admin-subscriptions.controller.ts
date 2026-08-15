import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AdminOnly } from '@/auth/admin-only.decorator';
import { GrantOrRevokeBody, AdminSubscriptionsService } from './admin-subscriptions.service';

@ApiTags('billing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@ApiForbiddenResponse({ schema: { example: { error: 'Acesso negado' } } })
@AdminOnly()
@Controller('admin/users/:id/subscription')
export class AdminSubscriptionsController {
  constructor(private readonly admin: AdminSubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Ofertas disponíveis e assinaturas do usuário — para o override manual.' })
  listar(@Param('id') id: string) {
    return this.admin.listarParaUsuario(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Concede ou revoga assinatura B2B manualmente, sem Stripe.',
    description: 'Body: { action: "grant", offerId } ou { action: "revoke", subscriptionId }.',
  })
  @ApiNotFoundResponse({ schema: { example: { error: 'Usuário não encontrado' } } })
  @ApiBadRequestResponse({ schema: { example: { error: 'offerId obrigatório' } } })
  @ApiConflictResponse({ schema: { example: { error: 'Usuário já possui assinatura ativa com este treinador' } } })
  async decidir(@Param('id') id: string, @Body() body: GrantOrRevokeBody) {
    if (body.action === 'grant') return this.admin.conceder(id, body.offerId);
    if (body.action === 'revoke') return this.admin.revogar(id, body.subscriptionId);
    throw new BadRequestException({ error: 'Ação inválida. Use grant ou revoke.' });
  }
}
