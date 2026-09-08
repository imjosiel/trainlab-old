'use client'

import { useSession } from 'next-auth/react'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import DashboardLayout from '@/components/dashboard/dashboard-layout'
import { PlatformTour } from '@/components/dashboard/platform-tour'

export default function DashboardRootLayout({ children }) {
    const { data: session, status } = useSession()

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        )
    }

    if (!session) return null

    return (
        <DashboardLayout session={session}>
            <PlatformTour />
            {children}
        </DashboardLayout>
    )
}
