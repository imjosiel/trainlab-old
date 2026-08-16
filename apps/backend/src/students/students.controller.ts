import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { CreateStudentBody, StudentsService, UpdateStudentProfileBody } from './students.service';

@ApiTags('students')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista alunos do treinador logado (admin pode ver de outro com ?trainerId=).' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'trainerId', required: false, description: 'Só admin.' })
  listar(
    @CurrentUser() user: SessionPayload,
    @Query('page') page?: string,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('trainerId') trainerId?: string,
  ) {
    return this.students.listar(user, { page, q, search, trainerId });
  }

  @Post()
  @ApiOperation({ summary: 'Cria aluno virtual + perfil de atleta + convite por e-mail.' })
  @ApiForbiddenResponse({ schema: { example: { error: 'Apenas treinadores podem adicionar alunos.' } } })
  criar(@CurrentUser() user: SessionPayload, @Body() body: CreateStudentBody) {
    return this.students.criar(user, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do aluno + planos de treino paginados (leitura).' })
  @ApiQuery({ name: 'page', required: false })
  @ApiNotFoundResponse({ schema: { example: { error: 'Aluno não encontrado ou sem permissão' } } })
  buscar(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Query('page') page?: string) {
    return this.students.buscar(id, user, { page });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove o aluno da lista do treinador.' })
  @ApiNotFoundResponse({ schema: { example: { error: 'Aluno não encontrado' } } })
  remover(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    return this.students.remover(id, user);
  }

  @Post(':id/profile')
  @ApiOperation({ summary: 'Cria/atualiza a ficha de atleta (anamnese) por esporte.' })
  @ApiForbiddenResponse({ schema: { example: { error: 'Aluno não encontrado ou sem permissão' } } })
  atualizarPerfil(@Param('id') id: string, @CurrentUser() user: SessionPayload, @Body() body: UpdateStudentProfileBody) {
    return this.students.atualizarPerfil(id, user, body);
  }
}
