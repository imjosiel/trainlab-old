import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { PusherAuthBody } from '@/common/dtos-admin';
import { PrismaService } from '@/prisma/prisma.service';
import { RealtimeService } from './realtime.service';
@ApiTags('pusher')
@ApiBearerAuth()
@Controller('pusher')
export class PusherAuthController {
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeService) {}
  @Post('auth')
  async auth(@CurrentUser() user: SessionPayload, @Body() body: PusherAuthBody) {
    const socket_id = body.socket_id ?? body.socketId;
    const channel = body.channel_name ?? body.channel;
    if (!socket_id || !channel) return { error: 'Missing params' };
    const userId = user.id;
    if (channel.startsWith('private-conversation-')) {
      const conversationId = channel.replace('private-conversation-', '');
      const conv: any = await this.prisma.conversation.findFirst({ where: { id: conversationId, OR: [{ trainerId: userId }, { studentId: userId }] }, select: { id: true } });
      if (!conv) return { error: 'Forbidden' };
    } else if (channel.startsWith('private-user-')) {
      const channelUserId = channel.replace('private-user-', '');
      if (channelUserId !== userId) return { error: 'Forbidden' };
    } else {
      return { error: 'Unknown channel' };
    }
    // @ts-ignore - authorizeChannel is on pusher instance
    const pusher: any = (this.realtime as any).obterCliente?.() ?? null;
    if (!pusher) return { error: 'Pusher não configurado' };
    return pusher.authorizeChannel(socket_id, channel, { user_id: userId });
  }
}
