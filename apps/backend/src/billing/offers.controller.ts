import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
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

import { CurrentUser } from '@/auth/current-user.decorator';
import { Public } from '@/auth/public.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { CreateOfferBody, OffersService, UpdateOfferBody } from './offers.service';

/** Página de venda — sem sessão, é o link que o aluno recebe. */
@ApiTags('billing')
@Controller('partner/offers/public')
export class PublicOffersController {
  constructor(private readonly offers: OffersService) {}

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Detalhes públicos de uma oferta ativa.',
    description: 'Select explícito (D79): nunca devolve o financeiro do parceiro (A79).',
  })
  @ApiNotFoundResponse({ schema: { example: { error: 'Oferta não encontrada ou inativa.' } } })
  buscar(@Param('id') id: string) {
    return this.offers.buscarPublica(id);
  }
}

@ApiTags('billing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('partner/offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  @ApiOperation({ summary: 'Ofertas do parceiro logado (ou de outro, se admin com ?partnerId=).' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'partnerId', required: false, description: 'Só admin.' })
  @ApiNotFoundResponse({ schema: { example: { error: 'Conta de parceiro não encontrada.' } } })
  listar(@CurrentUser() user: SessionPayload, @Query('page') page?: string, @Query('partnerId') partnerId?: string) {
    return this.offers.listarMinhas(user, { page, partnerId });
  }

  @Post()
  @ApiOperation({ summary: 'Cria oferta (produto + preço no Stripe).' })
  @ApiForbiddenResponse({ schema: { example: { error: 'Configure sua conta bancária antes de criar ofertas.' } } })
  @ApiBadRequestResponse({ schema: { example: { error: 'Preço mínimo para o seu Tier: R$ 50.00.' } } })
  criar(@CurrentUser() user: SessionPayload, @Body() body: CreateOfferBody) {
    return this.offers.criar(user, body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita, ativa/desativa, ou versiona (arquiva + cria nova) quando muda preço com assinantes ativos.',
  })
  @ApiNotFoundResponse({ schema: { example: { error: 'Oferta não encontrada.' } } })
  atualizar(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body() body: UpdateOfferBody) {
    return this.offers.atualizar(id, user, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apaga oferta sem histórico de assinantes.' })
  @ApiBadRequestResponse({
    description: 'Tem histórico de assinantes (ativos ou cancelados).',
    schema: { example: { error: 'Não é possível excluir uma oferta que possui histórico de assinantes...' } },
  })
  remover(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    return this.offers.remover(id, user);
  }
}
