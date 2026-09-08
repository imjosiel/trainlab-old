import { Body, Controller, ForbiddenException, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { ROLES } from '@/common/constants';
import { ScheduleConfigService } from './schedule-config.service';
import { UpdateScheduleConfigBody } from './dtos';

@ApiTags('appointments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@ApiForbiddenResponse({ schema: { example: { error: 'Apenas profissionais' } } })
@Controller('trainer/schedule-config')
export class ScheduleConfigController {
  constructor(private readonly config: ScheduleConfigService) {}

  /**
   * Aqui o papel decide LEGITIMAMENTE, e é o contraste com o A57: expediente é
   * atributo de quem atende, não uma relação entre duas pessoas. Onde a pergunta
   * é "de quem é esta linha?", papel é o atalho errado; onde é "esta pessoa
   * atende?", papel é a resposta certa.
   */
  private exigirProfissional(user: SessionPayload): void {
    if (!user.roles?.includes(ROLES.PROFESSIONAL)) {
      throw new ForbiddenException({ error: 'Apenas profissionais' });
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Expediente do profissional, criando o padrão na primeira visita.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        config: {
          id: 'cfg1',
          workStartHour: 7,
          workEndHour: 22,
          workDays: [1, 2, 3, 4, 5],
          blockedSlots: [],
        },
      },
    },
  })
  get(@CurrentUser() user: SessionPayload) {
    this.exigirProfissional(user);
    return this.config.get(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Atualiza horário e dias de expediente.' })
  @ApiBadRequestResponse({
    description:
      'Hora ou dia que não seja inteiro na faixa. String vazia inclusive — no legado ela ' +
      'passava e gravava 0 (A58).',
    schema: { example: { error: 'workStartHour inválido (inteiro de 0 a 23)' } },
  })
  update(@CurrentUser() user: SessionPayload, @Body() body: UpdateScheduleConfigBody) {
    this.exigirProfissional(user);
    return this.config.update(user.id, body);
  }
}
