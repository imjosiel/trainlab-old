import { Global, Module } from '@nestjs/common';

import { PusherAuthController } from './pusher-auth.controller';
import { RealtimeService } from './realtime.service';

/**
 * `@Global` porque tempo real é infraestrutura, como o Prisma: qualquer módulo
 * que grave algo que o navegador precise ver na hora depende disto, e importar
 * em cada um só adiciona ruído.
 */
@Global()
@Module({
  controllers: [PusherAuthController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
