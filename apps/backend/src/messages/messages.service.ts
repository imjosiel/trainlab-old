import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { RealtimeService } from './realtime.service';

export interface ListConversationsQuery {
  cursor?: string;
}

export interface CreateConversationBody {
  trainerId?: unknown;
  studentId?: unknown;
}

export interface ListMessagesQuery {
  before?: string;
}

export interface SendMessageBody {
  content?: unknown;
}

const CONV_PAGE = 50;
const MSG_PAGE = 50;
const MAX_CONTEUDO = 5000;

/** Quem aparece junto da conversa e da mensagem. Explícito, nunca o modelo inteiro. */
const PESSOA = { select: { id: true, name: true, image: true } } as const;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Participação nos DOIS lados — é o D60, e o que corrige o A50.
   *
   * O legado escolhia o lado pelo papel (`roles.includes(PROFESSIONAL)`), e quem
   * acumulava `PROFESSIONAL` e `CLIENT` perdia da lista as conversas em que era
   * cliente. Aqui o papel não participa da decisão: quem está na linha, vê.
   */
  private participacao(userId: string) {
    return { OR: [{ trainerId: userId }, { studentId: userId }] };
  }

  /** Posse como filtro da leitura (D17). Ausente e alheia dão o mesmo 404 (D16). */
  private async exigirParticipacao(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, ...this.participacao(userId) },
      select: { id: true },
    });

    if (!conv) throw new NotFoundException({ error: 'Conversa não encontrada' });
    return conv;
  }

  async listConversations(
    userId: string,
    query: ListConversationsQuery,
  ): Promise<{ conversations: unknown[]; nextCursor: string | null }> {
    const conversations = await this.prisma.conversation.findMany({
      where: this.participacao(userId),
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        trainer: PESSOA,
        student: PESSOA,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, content: true, senderId: true, createdAt: true, readAt: true },
        },
      },
      // O `id` como desempate torna a ordem TOTAL (D61). `lastMessageAt` é
      // nullable e não é único: sem desempate, o cursor do Prisma pula ou repete
      // linha na página seguinte — a mesma classe do BUG-65 (D18).
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: CONV_PAGE,
    });

    // Uma agregação no lugar de uma consulta por conversa (BUG-36 no legado).
    const naoLidas = conversations.length
      ? await this.prisma.message.groupBy({
          by: ['conversationId'],
          where: {
            conversationId: { in: conversations.map((c) => c.id) },
            senderId: { not: userId },
            readAt: null,
          },
          _count: { id: true },
        })
      : [];

    const porConversa = new Map(naoLidas.map((linha) => [linha.conversationId, linha._count.id]));

    return {
      conversations: conversations.map((conv) => ({
        ...conv,
        unreadCount: porConversa.get(conv.id) ?? 0,
      })),
      nextCursor:
        conversations.length === CONV_PAGE ? conversations[conversations.length - 1].id : null,
    };
  }

  /**
   * D63 — o A52 (qualquer um abre conversa com qualquer um) NÃO é fechado aqui:
   * decidir quem pode iniciar conversa com quem é regra de produto, não port.
   * Entra só o que não tem ambiguidade: ninguém consigo mesmo, e participante
   * inexistente vira 404 em vez de 500 por violação de chave estrangeira.
   */
  async createConversation(
    userId: string,
    body: CreateConversationBody,
  ): Promise<{ conversation: unknown }> {
    const trainerId = typeof body.trainerId === 'string' ? body.trainerId : '';
    const studentId = typeof body.studentId === 'string' ? body.studentId : '';

    if (!trainerId || !studentId) {
      throw new BadRequestException({ error: 'trainerId e studentId são obrigatórios' });
    }

    if (trainerId === studentId) {
      throw new BadRequestException({ error: 'Uma conversa precisa de duas pessoas diferentes' });
    }

    if (userId !== trainerId && userId !== studentId) {
      throw new ForbiddenException({ error: 'Acesso negado' });
    }

    const outro = userId === trainerId ? studentId : trainerId;
    const existe = await this.prisma.user.count({ where: { id: outro } });
    if (existe === 0) throw new NotFoundException({ error: 'Usuário não encontrado' });

    const conversation = await this.prisma.conversation.upsert({
      where: { trainerId_studentId: { trainerId, studentId } },
      create: { trainerId, studentId },
      update: {},
      include: { trainer: PESSOA, student: PESSOA },
    });

    return { conversation };
  }

  async listMessages(
    conversationId: string,
    userId: string,
    query: ListMessagesQuery,
  ): Promise<{ messages: { id: string }[] }> {
    await this.exigirParticipacao(conversationId, userId);

    // Cursor e ordenação no MESMO campo, e um campo único: `id`. Foi o acerto do
    // legado aqui (BUG-29), e é o que a lista de conversas não tinha.
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(query.before ? { id: { lt: query.before } } : {}),
      },
      include: { sender: PESSOA },
      orderBy: { id: 'desc' },
      take: MSG_PAGE,
    });

    return { messages: messages.reverse() };
  }

  async sendMessage(
    conversationId: string,
    userId: string,
    body: SendMessageBody,
  ): Promise<{ message: unknown }> {
    await this.exigirParticipacao(conversationId, userId);

    // A54: o limite mede o que SERÁ GRAVADO. O legado media o valor cru e
    // rejeitava 5.000 caracteres com um espaço no fim, que cabem.
    const conteudo = String(body.content ?? '').trim();

    if (!conteudo) throw new BadRequestException({ error: 'Mensagem vazia' });
    if (conteudo.length > MAX_CONTEUDO) {
      throw new BadRequestException({ error: 'Mensagem muito longa (máx. 5.000 caracteres).' });
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.message.create({
        data: { conversationId, senderId: userId, content: conteudo },
        include: { sender: PESSOA },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      return criada;
    });

    // D62 — entrega fora do caminho da resposta.
    //
    // A mensagem já está commitada. Deixar o erro do Pusher subir devolveria 500
    // numa escrita que FUNCIONOU, e o cliente reenviaria: duas mensagens iguais
    // no banco (A53). Perder o evento só atrasa — o cliente reconcilia por fetch,
    // como o sino de notificações passou a fazer na fatia 7.
    try {
      await this.realtime.emitirNovaMensagem(conversationId, message);
    } catch (erro) {
      this.logger.warn(
        `Mensagem ${(message as { id: string }).id} gravada, mas o evento de tempo real falhou: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }

    return { message };
  }

  async markRead(conversationId: string, userId: string): Promise<{ ok: true }> {
    await this.exigirParticipacao(conversationId, userId);

    await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });

    return { ok: true };
  }
}
