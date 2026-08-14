import { Module } from '@nestjs/common';

import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  controllers: [MessagesController],
  // RealtimeService vem do RealtimeModule, que é @Global (D70).
  providers: [MessagesService],
})
export class MessagesModule {}
