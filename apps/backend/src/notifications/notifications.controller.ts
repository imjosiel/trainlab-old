import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: { example: { error: 'Não autorizado' } } })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notificações do requisitante, mais recentes primeiro.' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: '`createdAt` em ISO 8601 — devolve as anteriores a esta data.',
  })
  @ApiQuery({ name: 'limit', required: false, description: '1 a 50, padrão 20.' })
  @ApiOkResponse({
    schema: {
      example: {
        notifications: [
          {
            id: 'clx123',
            type: 'PLAN_APPROVED',
            title: 'Plano aprovado',
            message: 'Seu treinador aprovou o plano.',
            isRead: false,
            createdAt: '2026-08-08T12:00:00.000Z',
          },
        ],
        unreadCount: 1,
        nextCursor: null,
      },
    },
  })
  list(
    @CurrentUser() user: SessionPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(user.id, { cursor, limit });
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marca como lida. Só alcança notificação do próprio requisitante.' })
  @ApiNotFoundResponse({
    description:
      'Não existe, ou existe e pertence a outro usuário — deliberadamente indistinguíveis.',
    schema: { example: { error: 'Notificação não encontrada' } },
  })
  markAsRead(@Param('id') id: string, @CurrentUser() user: SessionPayload) {
    return this.notifications.markAsRead(id, user.id);
  }
}
