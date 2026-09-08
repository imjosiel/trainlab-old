import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { ExercisesService } from './exercises.service';
import { AtualizarExercicioBody, CriarExercicioBody } from './dtos';
import { ListarExerciciosQuery } from '@/common/queries';

@ApiTags('exercises')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista exercícios do treinador, paginado.' })
  listar(@CurrentUser() user: SessionPayload, @Query() query: ListarExerciciosQuery) {
    return this.exercises.listar(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Cria exercício.' })
  @Throttle({ default: { limit: 50, ttl: 3_600_000 } })
  criar(@CurrentUser() user: SessionPayload, @Body() body: CriarExercicioBody) {
    return this.exercises.criar(user, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca exercício por id.' })
  buscar(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    return this.exercises.buscar(id, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edita exercício. Só o dono.' })
  atualizar(
    @Param('id') id: string,
    @CurrentUser() user: SessionPayload,
    @Body() body: AtualizarExercicioBody,
  ) {
    return this.exercises.atualizar(id, user, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apaga exercício e limpa arquivos de vídeo no R2.' })
  remover(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    return this.exercises.remover(id, user);
  }
}
