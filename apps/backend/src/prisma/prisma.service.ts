import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '.prisma-backend/client';

/**
 * Client próprio deste serviço, gerado com `output` isolado (D10 de
 * docs/implementation-plans/epic-nest-sports.md) — sem isso o generate daqui
 * sobrescreve o `@prisma/client` hoisted na raiz, que é o que apps/web usa.
 *
 * Aponta para o MESMO banco que apps/web. O histórico de migrations vive só
 * lá; este serviço nunca cria migration.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
