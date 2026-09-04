import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ROLES } from '@/lib/constants'

const DASHBOARD_MAP = {
  [ROLES.PROFESSIONAL]: '/dashboard',
  [ROLES.INDIVIDUAL]: '/dashboard',
  [ROLES.CLIENT]: '/dashboard/my-plan',
  [ROLES.PARTNER]: '/dashboard/partner',
  [ROLES.AFFILIATE]: '/dashboard/affiliate',
}

/**
 * Quick-role pós-login: atribui papel ao usuário novo e redireciona.
 * Porte do legado com vocabulário genérico (PROFESSIONAL/INDIVIDUAL/CLIENT).
 * Em vez de `lib/affiliate`, grava direto via Prisma (BFF não tem a lib).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role')

  if (!role || !DASHBOARD_MAP[role]) {
    return NextResponse.redirect(new URL('/?error=invalid_role', request.url))
  }

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/?error=unauthorized', request.url))
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { roles: true },
    })

    const existingRoles = (user?.roles ?? []).filter((r) => r !== 'PENDING')
    const isNewUser = existingRoles.length === 0

    if (isNewUser) {
      if (role === ROLES.AFFILIATE) {
        const code = `aff-${session.user.id.slice(0, 8)}-${Date.now().toString(36)}`
        await prisma.affiliateAccount
          .create({ data: { userId: session.user.id, referralCode: code, status: 'approved' } })
          .catch((e) => {
            if (e.code !== 'P2002') throw e
          })
      }

      if (role === ROLES.PARTNER) {
        await prisma.partnerAccount
          .create({
            data: {
              userId: session.user.id,
              status: 'pending',
              motivation: 'Candidatura via quick-role',
              partnerTier: 'starter',
            },
          })
          .catch((e) => {
            if (e.code !== 'P2002') throw e
          })
      }

      const finalRoles =
        role === ROLES.PARTNER
          ? [ROLES.PROFESSIONAL, ROLES.PARTNER]
          : [role]

      await prisma.user.update({
        where: { id: session.user.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { roles: finalRoles as any },
      })

      const dashboard = DASHBOARD_MAP[role] ?? '/dashboard'
      return NextResponse.redirect(new URL(dashboard, request.url))
    }

    const primaryRole = [ROLES.PARTNER, ROLES.AFFILIATE, ROLES.CLIENT, ROLES.PROFESSIONAL, ROLES.INDIVIDUAL].find(
      (r) => existingRoles.includes(r),
    )
    const dashboard = DASHBOARD_MAP[primaryRole ?? existingRoles[0]] ?? '/dashboard'
    return NextResponse.redirect(new URL(dashboard, request.url))
  } catch (error) {
    console.error('[QUICK_ROLE]', error)
    return NextResponse.redirect(new URL('/?error=quick_role_failed', request.url))
  }
}
