import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import {
  AffiliatesService,
  CriarSessaoDeOnboardingBody,
  ListarGanhosQuery,
} from './affiliates.service';

@ApiTags('affiliates')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('affiliate')
export class AffiliatesController {
  constructor(private readonly affiliates: AffiliatesService) {}

  @Post('connect/setup')
  @ApiOperation({ summary: 'Cria (ou reaproveita) a conta Stripe Connect do afiliado.' })
  configurarConta(@CurrentUser() user: SessionPayload) {
    return this.affiliates.configurarConta(user);
  }

  @Post('connect/session')
  @ApiOperation({ summary: 'Cria Account Session pro onboarding/gestão embutidos.' })
  criarSessaoDeOnboarding(
    @CurrentUser() user: SessionPayload,
    @Body() body: CriarSessaoDeOnboardingBody,
  ) {
    return this.affiliates.criarSessaoDeOnboarding(user, body);
  }

  @Post('connect/sync')
  @ApiOperation({ summary: 'Sincroniza o status Stripe Connect e faz flush de ganhos pendentes.' })
  sincronizar(@CurrentUser() user: SessionPayload) {
    return this.affiliates.sincronizar(user);
  }

  @Get('earnings')
  @ApiOperation({ summary: 'Histórico paginado de ganhos, com filtro de data.' })
  listarGanhos(@CurrentUser() user: SessionPayload, @Query() query: ListarGanhosQuery) {
    return this.affiliates.listarGanhos(user, query);
  }

  @Get('report')
  @ApiOperation({ summary: 'Relatório agregado por parceiro indicado, com projeção de MRR.' })
  relatorio(@CurrentUser() user: SessionPayload) {
    return this.affiliates.relatorio(user);
  }
}
