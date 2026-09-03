import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { TrainingPlansService } from './training-plans.service';
import { TrainingPlansCreateService } from './training-plans-create.service';
import { CreatePlanBody, ListPlansQuery, UpdatePlanBody } from './dtos';

@ApiTags('training-plans')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('training-plans')
export class TrainingPlansController {
  constructor(
    private readonly plans: TrainingPlansService,
    private readonly creator: TrainingPlansCreateService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista planos (trainer | atleta | aluno B2B | admin), paginada.' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiQuery({ name: 'athleteId', required: false })
  listar(@CurrentUser() user: SessionPayload, @Query() query: ListPlansQuery) {
    return this.plans.listar(user, query);
  }

  // Precisa vir ANTES de ':id' — mesmo formato de rota (2 segmentos, GET),
  // e 'active' é literal, não pode perder pra um :id greedy.
  @Get('active')
  @ApiOperation({ summary: 'Planos ativos do atleta logado, com progresso e filtro B2B.' })
  listarAtivos(@CurrentUser() user: SessionPayload) {
    return this.plans.listarAtivos(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca plano; bloqueia aluno B2B sem assinatura ativa (code: SUBSCRIPTION_REQUIRED).' })
  @ApiNotFoundResponse({ schema: { example: { error: 'Plano não encontrado' } } })
  buscar(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    return this.plans.buscar(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Aprova/rejeita/entrega, edita finalPlan/trainerNotes.' })
  @ApiForbiddenResponse({ schema: { example: { error: 'Apenas o treinador ou administradores podem aprovar/rejeitar planos' } } })
  atualizar(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body() body: UpdatePlanBody) {
    return this.plans.atualizar(id, user, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apaga o plano.' })
  remover(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    return this.plans.remover(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Cria plano (manual ou via IA com RAG + créditos).' })
  @Throttle({ default: { limit: 100, ttl: 3_600_000 } })
  criar(@CurrentUser() user: SessionPayload, @Body() body: CreatePlanBody) {
    return this.creator.criar(user, body);
  }
}
