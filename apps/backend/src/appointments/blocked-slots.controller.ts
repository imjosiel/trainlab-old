import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
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
import { SessionPayload } from '@/auth/session-payload';
import { ROLES } from '@/common/constants';
import { BlockedSlotsService, CreateBlockedSlotBody } from './blocked-slots.service';

@ApiTags('appointments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@ApiForbiddenResponse({ schema: { example: { error: 'Apenas profissionais' } } })
@Controller('trainer/blocked-slots')
export class BlockedSlotsController {
  constructor(private readonly slots: BlockedSlotsService) {}

  /** Mesma justificativa do `ScheduleConfigController`: expediente é atributo de
   *  quem atende, não relação entre duas pessoas. */
  private exigirProfissional(user: SessionPayload): void {
    if (!user.roles?.includes(ROLES.PROFESSIONAL)) {
      throw new ForbiddenException({ error: 'Apenas profissionais' });
    }
  }

  @Get()
  @ApiOperation({ summary: 'Bloqueios do expediente, do mais antigo ao mais recente.' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 8601' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO 8601' })
  @ApiBadRequestResponse({
    description:
      'Data inválida. No legado o filtro era descartado em silêncio e a resposta vinha com ' +
      'tudo (A64).',
    schema: { example: { error: 'from inválido. Use formato ISO 8601.' } },
  })
  list(
    @CurrentUser() user: SessionPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.exigirProfissional(user);
    return this.slots.list(user.id, { from, to });
  }

  @Post()
  @ApiOperation({ summary: 'Cria bloqueio.' })
  @ApiBadRequestResponse({ schema: { example: { error: 'endTime deve ser depois de startTime' } } })
  create(@CurrentUser() user: SessionPayload, @Body() body: CreateBlockedSlotBody) {
    this.exigirProfissional(user);
    return this.slots.create(user.id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apaga bloqueio próprio.' })
  @ApiNotFoundResponse({
    description: 'Não existe, ou existe e é de outro profissional — indistinguíveis (D16).',
    schema: { example: { error: 'Bloqueio não encontrado' } },
  })
  remove(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    this.exigirProfissional(user);
    return this.slots.remove(id, user.id);
  }
}
