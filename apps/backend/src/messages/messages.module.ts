import { Module } from '@nestjs/common';

import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { RealtimeService } from './realtime.service';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, RealtimeService],
})
export class MessagesModule {}
