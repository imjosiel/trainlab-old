import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AdminOnly } from '@/auth/admin-only.decorator';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { DecidirTierRequestBody, ForcarTierBody } from './dtos';
import { TierRequestsService } from './tier-requests.service';

@ApiTags('partner-tiers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@ApiForbiddenResponse({ schema: { example: { error: 'Acesso negado' } } })
@AdminOnly()
@Controller('admin/tier-requests')
export class TierRequestsController {
  constructor(private readonly pedidos: TierRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Fila de pedidos de troca de tier.' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'pending (padrão) | approved | rejected | auto_approved',
  })
  @ApiQuery({ name: 'page', required: false })
  listar(@Query('status') status?: string, @Query('page') page?: string) {
    return this.pedidos.listar({ status, page });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Aprova ou rejeita.',
    description:
      'Aprovar move `tierId`, `partnerTier` e `commissionRate` na mesma transação: os três ' +
      'descrevem o mesmo fato comercial, e comissão errada não dá erro, dá dinheiro errado.',
  })
  @ApiNotFoundResponse({ schema: { example: { error: 'Pedido não encontrado.' } } })
  @ApiBadRequestResponse({
    description: 'Ação inválida, pedido já processado, ou tier destino desativado desde o pedido.',
    schema: { example: { error: 'Este pedido já foi processado.' } },
  })
  decidir(
    @Param('id') id: string,
    @CurrentUser() admin: SessionPayload,
    @Body() body: DecidirTierRequestBody,
  ) {
    return this.pedidos.decidir(id, admin, body);
  }
}

@ApiTags('partner-tiers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@ApiForbiddenResponse({ schema: { example: { error: 'Acesso negado' } } })
@AdminOnly()
@Controller('admin/partners')
export class AdminPartnerTierController {
  constructor(private readonly pedidos: TierRequestsService) {}

  @Patch(':id/tier')
  @ApiOperation({
    summary: 'Força o tier de um parceiro.',
    description:
      'Existe porque o webhook do Stripe pode falhar depois de um pagamento confirmado. ' +
      'Grava um `PartnerTierRequest` junto — troca sem rastro seria indistinguível de troca ' +
      'legítima na auditoria.',
  })
  forcar(
    @Param('id') id: string,
    @CurrentUser() admin: SessionPayload,
    @Body() body: ForcarTierBody,
  ) {
    return this.pedidos.forcarTier(id, admin, body);
  }
}
