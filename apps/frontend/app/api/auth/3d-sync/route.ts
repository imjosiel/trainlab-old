import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { encode } from 'next-auth/jwt'

// Payload mínimo da sessão para o token 3D — espelha o que o NextAuth grava
// no JWT (ver lib/auth.ts). Definido aqui para não depender de lib server-side.
type SessionPayload = {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
  roles?: string[]
  systemRoles?: string[]
  isAdmin?: boolean
  subscriptionStatus?: string | null
  subscriptionPlan?: string | null
  stripeCustomerId?: string | null
}

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/3d-sync
 *
 * Endpoint consumido automaticamente após o usuário fazer login via /3d-login.
 * 1. Verifica a sessão existente do cookie (getServerSession).
 * 2. Embala em um JWT (Bearer format).
 * 3. Redireciona o usuário (302) de volta para o ambiente 3D anexando o JWT na URL.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    // Se o usuário tentar acessar isso sem estar logado no SaaS,
    // manda ele de volta pro login explicitamente
    if (!session || !session.user) {
      return NextResponse.redirect(new URL('/3d-login', req.url))
    }

    const { user } = session

    // A sessão é formatada no SessionPayload padrão
    const tokenPayload: SessionPayload = {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
      roles: user.roles,
      systemRoles: user.systemRoles,
      isAdmin: user.isAdmin,
      subscriptionStatus: user.subscriptionStatus ?? null,
      subscriptionPlan: user.subscriptionPlan ?? null,
      stripeCustomerId: user.stripeCustomerId ?? null,
    }

    // Usamos a chave secreta do NextAuth para codificar o token compatível com getToken()
    // BUG-44: maxAge garante que tokens 3D também expiram (7 dias = padrão NextAuth)
    const rawJwt = await encode({
      token: tokenPayload as any,
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge: 60 * 60 * 24 * 7, // 7 dias
    })

    // Redireciona para o aplicativo 3D
    const frontendUrl = process.env.FRONTEND_3D_URL || 'http://localhost:5173'
    
    // Opcionalmente podemos usar o hash fragment (#token=) para não vazar a origin HTTP Referrer fácil
    const redirectUrl = new URL(frontendUrl)
    redirectUrl.searchParams.set('sync_token', rawJwt)
    
    // O NextAuth encripta o JWT (JWE). Enviaremos os dados visuais via base64url_encode extra, 
    // já que o 3D não consegue descriptografar a chave privada do auth
    const userPayloadBase64 = Buffer.from(JSON.stringify({
      name: user.name,
      email: user.email,
      image: user.image,
      roles: user.roles,
    })).toString('base64')
    
    redirectUrl.searchParams.set('user_data', userPayloadBase64)

    return NextResponse.redirect(redirectUrl.toString())
  } catch (error) {
    console.error('[3D_SYNC_ERROR]', error)
    return NextResponse.json({ error: 'Falha ao sincronizar auth.' }, { status: 500 })
  }
}
