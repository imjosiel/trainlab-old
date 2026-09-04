/**
 * middleware.ts
 *
 * Middleware central de segurança, internacionalização e CORS:
 * 1. CORS → Gerencia preflight (OPTIONS) e headers para /api/*
 * 2. Autenticação Edge (Proteção de Rotas) → /dashboard e /admin
 * 3. i18n → Internacionalização via next-intl
 */

import { NextResponse, NextRequest } from 'next/server'
import { getToken }                  from 'next-auth/jwt'
import createIntlMiddleware          from 'next-intl/middleware'
import { ADMIN_SYSTEM_ROLES }        from '@/lib/constants'

// Configurações de i18n
const locales        = ['pt-BR', 'en', 'es'] as const
const defaultLocale  = 'pt-BR'

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
})

/**
 * Lógica principal do middleware
 */
export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  // --- 1. Lógica de CORS para API (/api/*) ---
  if (pathname.startsWith('/api')) {
    const origin = req.headers.get('origin')
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || ['*']
    
    // Verifica se a origem é permitida
    const isAllowedOrigin = allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))
    
    // Resposta especial para preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 })
      if (isAllowedOrigin && origin) {
        response.headers.set('Access-Control-Allow-Origin', origin)
        // Credentials só pode ser true com origem explícita (não com '*')
        response.headers.set('Access-Control-Allow-Credentials', 'true')
      } else if (allowedOrigins.includes('*')) {
        response.headers.set('Access-Control-Allow-Origin', '*')
        // Não definir Credentials aqui: incompatível com Origin: * (BUG-20)
      }
      
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
      response.headers.set('Access-Control-Max-Age', '86400') // 24 horas de cache para preflight
      return response
    }
  }

  // --- 2. Proteção de Rotas (Edge auth) ---
  const isProtectedRoute = pathname.includes('/dashboard') || pathname.includes('/admin')

  if (isProtectedRoute) {
    const token = await getToken({
      req,
      secret:       process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NODE_ENV === 'production' || !!process.env.VERCEL_URL,
    })

    // Token ausente → redireciona para a home
    if (!token || !token.id) {
      const url = req.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }

    // Usuário PENDING → redireciona para onboarding
    const userRoles     = (token.roles as string[]) ?? []
    const isPendingOnly = userRoles.length === 0 || (userRoles.length === 1 && userRoles[0] === 'PENDING')
    const isOnboarding  = pathname.includes('/dashboard/onboarding')
    
    if (isPendingOnly && pathname.includes('/dashboard') && !isOnboarding) {
      const url = req.nextUrl.clone()
      url.pathname = '/dashboard/onboarding'
      return NextResponse.redirect(url)
    }

    // Rota /admin → exige systemRole ADMIN ou MODERATOR
    const systemRoles = (token.systemRoles as string[]) ?? []
    if (pathname.includes('/admin') && !ADMIN_SYSTEM_ROLES.some(r => systemRoles.includes(r))) {
      const url = req.nextUrl.clone()
      const localeMatch  = pathname.match(/^\/(pt-BR|en|es)\//)
      const localePrefix = localeMatch ? `/${localeMatch[1]}` : ''
      url.pathname = `${localePrefix}/dashboard`
      return NextResponse.redirect(url)
    }
  }

  // --- 3. Execução do intlMiddleware (se não for API) ---
  // Para rotas de API, retornamos o fluxo normal sem intl
  if (pathname.startsWith('/api')) {
    const response = NextResponse.next()
    
    // Adiciona headers CORS na resposta final da API
    const origin = req.headers.get('origin')
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || ['*']
    const isAllowedOrigin = allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))
    
    if (isAllowedOrigin && origin) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Access-Control-Allow-Credentials', 'true')
      response.headers.set('Vary', 'Origin')
    } else if (allowedOrigins.includes('*')) {
      response.headers.set('Access-Control-Allow-Origin', '*')
    }
    
    return response
  }

  return intlMiddleware(req)
}

/**
 * Configuração do matcher do middleware
 */
export const config = {
  // Executa em todas as rotas exceto assets estáticos e arquivos internos
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
}
