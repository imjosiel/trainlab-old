import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { CreditsService } from './credits.service';

@ApiTags('credits')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('credits')
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Get()
  @ApiOperation({ summary: 'Saldo (plan + purchased) e últimas 20 transações. { enabled: false } se desligado ou não-treinador.' })
  verSaldo(@CurrentUser() user: SessionPayload) {
    return this.credits.verSaldo(user);
  }

  @Get('packages')
  @ApiOperation({ summary: 'Pacotes de crédito ativos, para compra.' })
  listarPacotes() {
    return this.credits.listarPacotesPublicos();
  }
}
