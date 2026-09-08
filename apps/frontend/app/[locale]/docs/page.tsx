import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import SwaggerClient from './swagger-client'

export const dynamic = 'force-dynamic'

export default async function DocsPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.isAdmin) {
    redirect('/')
  }

  return <SwaggerClient />
}
