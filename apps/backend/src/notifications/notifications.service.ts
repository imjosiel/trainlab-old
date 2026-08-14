import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { parseLimit } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import { RealtimeService } from '@/realtime/realtime.service';

export interface ListNotificationsQuery {
  cursor?: string;
  limit?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(userId: string, query: ListNotificationsQuery) {
    const limit = parseLimit(query.limit, DEFAULT_LIMIT, MAX_LIMIT);

    // `new Date('foo')` é Invalid Date, que o Prisma rejeita com P2005 e viraria
    // 500. Validado aqui para virar 400 (BUG-108 no legado, D19).
    let cursorDate: Date | undefined;
    if (query.cursor) {
      cursorDate = new Date(query.cursor);
      if (Number.isNaN(cursorDate.getTime())) {
        throw new BadRequestException({ error: 'Cursor inválido. Use formato ISO 8601.' });
      }
    }

    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        // O cursor usa createdAt, o MESMO campo do orderBy. Cursor por `id` é
        // frágil: CUID é quase ordenado por tempo, e "quase" faz a página
        // seguinte pular ou repetir linha (BUG-65 no legado, D18).
        where: {
          userId,
          ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    const nextCursor =
      notifications.length === limit
        ? notifications[notifications.length - 1].createdAt.toISOString()
        : null;

    return { notifications, unreadCount, nextCursor };
  }

  /**
   * ESQUELETO — fatia 13, passo vermelho (D70).
   *
   * Grava a notificação **e** emite o push, explicitamente.
   *
   * No monolito isso é implícito: `apps/web/lib/prisma.ts` tem um `$extends` que
   * intercepta `notification.create` e dispara Pusher sozinho. O `PrismaService`
   * do Nest não tem essa extensão, então o primeiro recurso migrado que CRIA
   * notificação — agendamentos — gravaria a linha e o sino não receberia nada,
   * em silêncio total (o `trigger` do legado engole erro com `.catch(() => {})`).
   *
   * Replicar o `$extends` aqui foi descartado: quem lê `notification.create` não
   * tem como saber que aquilo manda um WebSocket, e desfazer esse tipo de
   * acoplamento implícito é o motivo desta reescrita existir.
   */
  async criar(entrada: {
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string } | null> {
    const { userId, type, title, message, link = null, metadata } = entrada;

    if (!userId || !type || !title || !message) {
      this.logger.warn(`Notificação sem campo obrigatório — ignorada (userId=${userId}, type=${type})`);
      return null;
    }

    const notif = await this.prisma.notification.create({
      data: { userId, type, title, message, link, metadata: metadata as never },
    });

    // Entrega fora do caminho da resposta, mesma regra do D62: a notificação já
    // está gravada, e derrubar a operação de domínio porque o WebSocket falhou
    // trocaria uma perda de latência por uma perda de escrita.
    try {
      await this.realtime.emitirNovaNotificacao(userId, notif);
    } catch (erro) {
      this.logger.warn(
        `Notificação ${notif.id} gravada, mas o push falhou: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }

    return notif;
  }

  /**
   * Posse como FILTRO da escrita, não checagem depois da leitura (D17).
   *
   * `count: 0` cobre os dois casos — não existe, ou existe e é de outro — e os
   * dois devolvem o mesmo 404 (D16), então o endpoint não revela existência a
   * quem só tem o id.
   */
  async markAsRead(id: string, userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });

    if (count === 0) throw new NotFoundException({ error: 'Notificação não encontrada' });

    // Só depois de a posse estar provada. O legado devolve a linha atualizada e
    // `updateMany` não devolve linha, daí a segunda consulta.
    return this.prisma.notification.findUnique({ where: { id } });
  }
}
