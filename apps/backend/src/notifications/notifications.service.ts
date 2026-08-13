import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { parseLimit } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';

export interface ListNotificationsQuery {
  cursor?: string;
  limit?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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
