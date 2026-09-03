/**
 * types/next-auth.d.ts
 *
 * Extensão dos tipos do NextAuth para incluir campos customizados
 * em Session.user e JWT.
 */

import type { DefaultSession } from 'next-auth'
import type { JWT as DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      roles: string[] // valores do enum UserRole como strings
      systemRoles: string[] // valores do enum SystemRole como strings
      isAdmin: boolean
      subscriptionStatus?: string | null
      subscriptionPlan?: string | null
      stripeCustomerId?: string | null
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id?: string
    roles?: string[]
    systemRoles?: string[]
    subscriptionStatus?: string | null
    subscriptionPlan?: string | null
    stripeCustomerId?: string | null
    dbCheckedAt?: number
  }
}
