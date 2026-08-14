import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { Public } from '@/auth/public.decorator';
import { SessionPayload } from '@/auth/session-payload';
import {
  AppointmentsService,
  CreateAppointmentBody,
  UpdateAppointmentBody,
} from './appointments.service';

@ApiTags('appointments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /* ──────────────────────────────────────────────────────────────────────────
   * Link mágico — públicas (D67). Declaradas primeiro por clareza: o caminho é
   * mais específico que os `:id` abaixo.
   * ────────────────────────────────────────────────────────────────────────── */

  @Public()
  @Get('confirm/:token')
  @ApiOperation({
    summary: 'Dados do agendamento pelo link de confirmação.',
    description:
      'Sem sessão: o token É a autorização (D67). Chega por e-mail a quem pode não ter conta. ' +
      'A resposta não devolve o próprio token.',
  })
  @ApiNotFoundResponse({ schema: { example: { error: 'INVALID' } } })
  @ApiConflictResponse({
    description: 'Já confirmado, cancelado, concluído ou expirado.',
    schema: { example: { error: 'ALREADY_CONFIRMED' } },
  })
  findByToken(@Param('token') token: string) {
    return this.appointments.findByToken(token);
  }

  @Public()
  @Post('confirm/:token')
  // 200, não o 201 padrão do Nest: confirmar não cria recurso, muda o estado de
  // um que já existe. É também o que o legado devolve, e paridade de status é
  // parte do contrato — o cutover não deve mexer no que a tela observa.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirma ou cancela pelo link.',
    description:
      'Duas requisições simultâneas: uma responde 200 e a outra 409 — nunca 500 (D68).',
  })
  confirmByToken(@Param('token') token: string, @Body() body: { action?: unknown }) {
    return this.appointments.confirmByToken(token, body?.action);
  }

  /* ────────────────────────────────────────────────────────────────────────── */

  @Get()
  @ApiOperation({
    summary: 'Agenda do requisitante.',
    description:
      'Traz o que ele marcou E o que marcaram para ele. O papel não decide o lado — ' +
      'quem participa, vê (D64).',
  })
  @ApiQuery({ name: 'status', required: false, description: 'PENDING | CONFIRMED | CANCELED | COMPLETED' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 8601' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO 8601' })
  @ApiQuery({ name: 'page', required: false, description: 'Página, 50 por vez.' })
  @ApiQuery({ name: 'trainerId', required: false, description: 'Só admin: agenda de outro profissional.' })
  list(
    @CurrentUser() user: SessionPayload,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('trainerId') trainerId?: string,
  ) {
    return this.appointments.list(user, { status, from, to, page, trainerId });
  }

  @Post()
  @ApiOperation({
    summary: 'Cria agendamento.',
    description:
      'Só profissional ou admin. O Google Meet, quando pedido, é criado DEPOIS de gravar: ' +
      'corpo inválido não chega a tocar no Google (D66).',
  })
  @ApiBadRequestResponse({ schema: { example: { error: 'title e scheduledAt são obrigatórios' } } })
  @ApiForbiddenResponse({ schema: { example: { error: 'Acesso negado' } } })
  create(@CurrentUser() user: SessionPayload, @Body() body: CreateAppointmentBody) {
    return this.appointments.create(user, body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita, ou executa `generate-link` / `revoke-link`.',
    description: 'Quem é atendido só confirma ou cancela.',
  })
  @ApiNotFoundResponse({ schema: { example: { error: 'Agendamento não encontrado' } } })
  update(
    @Param('id') id: string,
    @CurrentUser() user: SessionPayload,
    @Body() body: UpdateAppointmentBody,
  ) {
    return this.appointments.update(id, user, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apaga. Só o profissional dono ou admin.' })
  @ApiOkResponse({ schema: { example: { message: 'Agendamento deletado' } } })
  remove(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    return this.appointments.remove(id, user);
  }
}
