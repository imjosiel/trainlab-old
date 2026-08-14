import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import {
  CreateConversationBody,
  MessagesService,
  SendMessageBody,
} from './messages.service';

@ApiTags('conversations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('conversations')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @ApiOperation({
    summary: 'Conversas do requisitante, mais recente primeiro.',
    description:
      'Inclui a conversa em qualquer um dos dois lados. O papel do requisitante não ' +
      'participa da decisão — quem está na linha, vê (D60).',
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'id da última conversa da página anterior.' })
  @ApiOkResponse({
    schema: {
      example: {
        conversations: [
          {
            id: 'clx123',
            trainer: { id: 'u1', name: 'Ana', image: null },
            student: { id: 'u2', name: 'Bruno', image: null },
            messages: [{ id: 'm9', content: 'até amanhã', senderId: 'u2', readAt: null }],
            unreadCount: 1,
          },
        ],
        nextCursor: null,
      },
    },
  })
  listConversations(@CurrentUser() user: SessionPayload, @Query('cursor') cursor?: string) {
    return this.messages.listConversations(user.id, { cursor });
  }

  @Post()
  @ApiOperation({ summary: 'Cria ou recupera a conversa entre um profissional e um cliente.' })
  @ApiBadRequestResponse({ schema: { example: { error: 'trainerId e studentId são obrigatórios' } } })
  @ApiForbiddenResponse({
    description: 'O requisitante precisa ser um dos dois participantes.',
    schema: { example: { error: 'Acesso negado' } },
  })
  createConversation(@CurrentUser() user: SessionPayload, @Body() body: CreateConversationBody) {
    return this.messages.createConversation(user.id, body);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Página de mensagens, mais antigas primeiro.' })
  @ApiQuery({
    name: 'before',
    required: false,
    description: 'id da mensagem mais antiga já carregada — devolve as anteriores a ela.',
  })
  @ApiNotFoundResponse({
    description: 'Não existe, ou existe e é de outras pessoas — deliberadamente indistinguíveis.',
    schema: { example: { error: 'Conversa não encontrada' } },
  })
  listMessages(
    @Param('id') id: string,
    @CurrentUser() user: SessionPayload,
    @Query('before') before?: string,
  ) {
    return this.messages.listMessages(id, user.id, { before });
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Envia mensagem.',
    description:
      'A entrega em tempo real acontece fora do caminho da resposta: mensagem gravada é ' +
      'sucesso, mesmo que o disparo do evento falhe (D62).',
  })
  @ApiBadRequestResponse({ schema: { example: { error: 'Mensagem vazia' } } })
  sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: SessionPayload,
    @Body() body: SendMessageBody,
  ) {
    return this.messages.sendMessage(id, user.id, body);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marca como lidas as mensagens que a outra pessoa enviou.' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  markRead(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    return this.messages.markRead(id, user.id);
  }
}
