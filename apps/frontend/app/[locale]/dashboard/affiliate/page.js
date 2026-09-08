import { ROLES } from '@/lib/constants'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AffiliateDashboardContent from './affiliate-content'

export default async function AffiliateDashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')
  if (!session.user.roles?.includes(ROLES.AFFILIATE) && !session.user.systemRoles?.includes('ADMIN')) {
    redirect('/dashboard')
  }

  const affiliateAccount = await prisma.affiliateAccount.findUnique({
    where: { userId: session.user.id },
    include: {
      earnings: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      _count: {
        select: { referredPartners: true },
      },
    },
  })

  return <AffiliateDashboardContent affiliate={affiliateAccount} />
}
