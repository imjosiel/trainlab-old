/**
 * lib/prisma.ts
 *
 * Singleton do PrismaClient para o web (NextAuth adapter + callbacks).
 * Aponta para o MESMO banco que o backend. O histórico de migrations vive em
 * `apps/backend/prisma/migrations`; este app nunca cria migration — só gera o
 * client padrão (`@prisma/client` hoisted) a partir do schema espelhado em
 * `apps/web/prisma/schema.prisma`.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
