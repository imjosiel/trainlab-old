'use client'

import { ADMIN_SYSTEM_ROLES } from '@/lib/constants'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Users, CreditCard, ArrowLeft, Loader2, ShieldCheck, Star, BarChart3, FileBarChart, Shield, Coins } from 'lucide-react'
import { useEffect } from 'react'

export default function AdminLayout({ children }) {
    const { data: session, status } = useSession()
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        if (status === 'loading') return
        const isStaff = session?.user?.systemRoles?.some(r => ADMIN_SYSTEM_ROLES.includes(r))
        if (status === 'unauthenticated' || !isStaff) {
            router.push('/dashboard')
        }
    }, [session, status, router])

    if (status === 'loading') {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-900">
                <Loader2 className="h-8 w-8 animate-spin text-green-500" />
            </div>
        )
    }

    const isStaff = session?.user?.systemRoles?.some(r => ADMIN_SYSTEM_ROLES.includes(r))
    if (!isStaff) {
        return null
    }

    const navigation = [
        { name: 'Visão Geral', href: '/admin', icon: LayoutDashboard },
        { name: 'Usuários', href: '/admin/users', icon: Users },
        { name: 'Planos e Preços', href: '/admin/pricing', icon: CreditCard },
        { name: 'Esportes', href: '/admin/sports', icon: ShieldCheck },
        { name: 'Parceiros B2B', href: '/admin/partners', icon: Star },
        { name: 'Faturamento B2B', href: '/admin/partners/revenue', icon: BarChart3 },
        { name: 'Relatórios', href: '/admin/reports', icon: FileBarChart },
        { name: 'Auditoria', href: '/admin/auditoria', icon: Shield },
        { name: 'Créditos', href: '/admin/credits', icon: Coins },
        { name: 'Config. Globais', href: '/admin/settings', icon: LayoutDashboard },
    ]

    const getTitle = () => {
        const activeNav = navigation.find(n => n.href === pathname)
        return activeNav ? activeNav.name : 'Administração'
    }

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Admin Sidebar (Dark Mode) */}
            <div className="w-64 bg-slate-900 text-slate-300 flex flex-col fixed inset-y-0 z-50 shadow-xl">
                <div className="p-6 flex items-center gap-3 text-white border-b border-slate-800">
                    <div className="bg-green-600 p-2 rounded-lg">
                        <ShieldCheck className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg leading-none">Admin</h1>
                        <span className="text-xs text-slate-400">Player.Action</span>
                    </div>
                </div>

                <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                    {navigation.map((item) => {
                        const isActive = pathname === item.href
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${isActive
                                    ? 'bg-slate-800 text-white font-medium shadow-sm'
                                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                                    }`}
                            >
                                <Icon className="w-5 h-5" />
                                {item.name}
                            </Link>
                        )
                    })}
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-slate-400 hover:bg-slate-800 hover:text-white"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        Sair do Admin
                    </Link>
                </div>
            </div>

            {/* Main Content Area (offset by sidebar width) */}
            <div className="ml-64 flex-1 flex flex-col min-h-screen">
                <header className="bg-white border-b border-slate-200 h-16 flex items-center px-8 shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-800">{getTitle()}</h2>
                </header>
                <main className="flex-1 p-8">
                    {children}
                </main>
            </div>
        </div>
    )
}
