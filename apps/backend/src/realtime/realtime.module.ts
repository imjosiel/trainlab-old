import { Global, Module } from '@nestjs/common';

import { RealtimeService } from './realtime.service';

/**
 * `@Global` porque tempo real é infraestrutura, como o Prisma: qualquer módulo
 * que grave algo que o navegador precise ver na hora depende disto, e importar
 * em cada um só adiciona ruído.
 */
@Global()
@Module({
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
