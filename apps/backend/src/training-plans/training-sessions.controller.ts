import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { TrainingSessionsService } from './training-sessions.service';
import { CreateSessionBody, EditSessionBody, UpdateSessionBody } from './dtos';

@ApiTags('training-plans')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@ApiForbiddenResponse({ schema: { example: { error: 'Sem permissão' } } })
@Controller('training-plans')
export class TrainingSessionsController {
  constructor(private readonly sessions: TrainingSessionsService) {}

  @Post(':id/sessions')
  @ApiOperation({ summary: 'Treinador adiciona sessão manualmente ao plano.' })
  criar(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body() body: CreateSessionBody) {
    return this.sessions.criar(id, user, body);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Detalhe de uma sessão.' })
  @ApiNotFoundResponse({ schema: { example: { error: 'Sessao nao encontrada' } } })
  buscar(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    return this.sessions.buscar(id, user);
  }

  @Patch('sessions/:id')
  @ApiOperation({ summary: 'Atleta/aluno marca sessão como completa, envia feedback.' })
  atualizar(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body() body: UpdateSessionBody) {
    return this.sessions.atualizar(id, user, body);
  }

  @Put('sessions/:id')
  @ApiOperation({ summary: 'Treinador edita a sessão.' })
  editar(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body() body: EditSessionBody) {
    return this.sessions.editar(id, user, body);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Treinador remove a sessão.' })
  remover(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    return this.sessions.remover(id, user);
  }
}
