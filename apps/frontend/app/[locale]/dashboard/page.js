import { ROLES } from '@/lib/constants'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import DashboardContent from '@/components/dashboard/dashboard-content'
import DashboardSkeleton from '@/components/dashboard/dashboard-skeleton'

/**
 * Dashboard via BFF (nunca Prisma direto — o banco é do backend).
 *
 * Server Component sem token bruto disponível (getToken precisa do req);
 * DashboardContent busca stats por HTTP no cliente via /api/backend.
 */
export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session) redirect('/')

  const hasRole = session.user.roles?.length > 0 && !session.user.roles.includes(ROLES.PENDING)
  if (!hasRole) redirect('/dashboard/onboarding')

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent session={session} stats={null} activePlans={[]} />
    </Suspense>
  )
}
