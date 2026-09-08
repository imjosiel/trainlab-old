import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import {
  PartnerConnectService,
} from './partner-connect.service';
import { CandidatarBody, CriarSessaoDeOnboardingBody } from './dtos';

@ApiTags('partner-connect')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('partner')
export class PartnerConnectController {
  constructor(private readonly partnerConnect: PartnerConnectService) {}

  @Post('apply')
  @ApiOperation({ summary: 'Candidatura de parceiro B2B (nova ou reaplicação após rejeição).' })
  candidatar(@CurrentUser() user: SessionPayload, @Body() body: CandidatarBody) {
    return this.partnerConnect.candidatar(user, body);
  }

  @Post('connect/setup')
  @ApiOperation({ summary: 'Cria (ou reaproveita) a conta Stripe Connect do parceiro.' })
  configurarConta(@CurrentUser() user: SessionPayload) {
    return this.partnerConnect.configurarConta(user);
  }

  @Post('connect/session')
  @ApiOperation({ summary: 'Cria Account Session pro onboarding embutido.' })
  criarSessaoDeOnboarding(
    @CurrentUser() user: SessionPayload,
    @Body() body: CriarSessaoDeOnboardingBody,
  ) {
    return this.partnerConnect.criarSessaoDeOnboarding(user, body);
  }

  @Post('connect/sync')
  @ApiOperation({ summary: 'Sincroniza o status real da Stripe Connect com o banco.' })
  sincronizar(@CurrentUser() user: SessionPayload) {
    return this.partnerConnect.sincronizar(user);
  }
}
