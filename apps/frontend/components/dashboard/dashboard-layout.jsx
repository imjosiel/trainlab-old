'use client'

import { signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Trophy, Users, FileText, User, LogOut, Menu, X, CreditCard, Settings, Dumbbell, ShieldAlert, Star, Tag, BarChart3, Wallet, Coins, CalendarDays, MessageSquare, Link2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { NotificationBell } from '@/components/dashboard/notification-bell'
import { MiniChat } from '@/components/dashboard/mini-chat'
import { ROLES, ADMIN_SYSTEM_ROLES } from '@/lib/constants'

export default function DashboardLayout({ children, session }) {
  const pathname = usePathname()
  const t = useTranslations('Navigation')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Defaults otimistas: assume módulos ativos até settings carregar
  // Segurança: as páginas em si validam permissões no servidor
  const [settings, setSettings] = useState({ moduleCoachEnabled: true, moduleAthleteEnabled: true })
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [credits, setCredits] = useState(null) // null = not loaded / disabled
  const [creditsEnabled, setCreditsEnabled] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)

  useEffect(() => {
    fetch('/api/backend/admin/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setSettings(data) })
      .catch(console.error)
      .finally(() => setSettingsLoading(false))

    fetch('/api/backend/credits')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.enabled) {
          setCredits(data.totalCredits ?? data.balance ?? 0)
          setCreditsEnabled(true)
        }
      })
      .catch(console.error)

    // Busca inicial do badge de não lidas (sem polling — MiniChat atualiza via Pusher)
    fetch('/api/backend/conversations')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.conversations) {
          const total = data.conversations.reduce((s, c) => s + (c.unreadCount ?? 0), 0)
          setUnreadMessages(total)
        }
      })
      .catch(() => {})
  }, [])

  const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)
  const isAthlete = session?.user?.roles?.some(r => [ROLES.INDIVIDUAL, ROLES.CLIENT].includes(r))
  const isPartner = session?.user?.roles?.includes(ROLES.PARTNER) || session?.user?.systemRoles?.includes('ADMIN')
  const isAffiliate = session?.user?.roles?.includes(ROLES.AFFILIATE)
  const isStrictlyAthlete = isAthlete && !isTrainer
  const isAdmin = ADMIN_SYSTEM_ROLES.some(r => session?.user?.systemRoles?.includes(r))

  // Parceiros sempre veem os links de treinador; outros dependem de moduleCoachEnabled
  const showTrainerLinks = isTrainer && (settings?.moduleCoachEnabled || isPartner)

  // ── Navegação por Role ─────────────────────────────────────────────────────
  // Cada role define seus links específicos. A sidebar monta a união dos roles
  // do usuário, deduplicando por href. Segurança: é apenas visual — auth real
  // está nos page.js server-side.
  const NAV_TRAINER = showTrainerLinks ? [
    { name: 'Meus Alunos', icon: Users, href: '/dashboard/students' },
    { name: t('exercises'), icon: Dumbbell, href: '/dashboard/exercises' },
    { name: t('plans'), icon: FileText, href: '/dashboard/plans' },
  ] : []

  const NAV_ATHLETE = [
    ...((showTrainerLinks || settings?.moduleAthleteEnabled || isStrictlyAthlete)
      ? [{ name: t('plans'), icon: FileText, href: '/dashboard/plans' }] : []),
    ...(settings?.moduleAthleteEnabled
      ? [{ name: t('myPlan'), icon: Dumbbell, href: '/dashboard/my-plan' }] : []),
  ]

  const NAV_COMMUNICATION = [
    { name: 'Agendamentos', icon: CalendarDays, href: '/dashboard/appointments' },
    { name: 'Mensagens', icon: MessageSquare, href: '/dashboard/messages', badge: unreadMessages || null },
  ]

  const NAV_PARTNER = [
    { name: 'Assinaturas & Ofertas', icon: Tag, href: '/dashboard/partner/offers' },
    { name: 'Receita', icon: BarChart3, href: '/dashboard/partner/revenue' },
  ]

  const NAV_AFFILIATE = [
    { name: 'Programa de Afiliados', icon: Link2, href: '/dashboard/affiliate' },
  ]

  const NAV_COMMON = [
    ...((!isAffiliate || isTrainer || isAthlete || isPartner)
      ? [{ name: 'Assinatura', icon: Wallet, href: isStrictlyAthlete ? '/dashboard/billing' : '/dashboard/subscription' }] : []),
    ...(creditsEnabled && isTrainer ? [{ name: 'Créditos', icon: Coins, href: '/dashboard/credits' }] : []),
    { name: t('myProfile'), icon: User, href: '/dashboard/profile' },
    { name: t('settings'), icon: Settings, href: '/dashboard/settings' },
    ...(isAdmin ? [{ name: t('admin'), icon: ShieldAlert, href: '/admin' }] : []),
  ]

  // Montar navegação como união dos roles — deduplicar por href
  const roleLinks = [
    ...(isTrainer ? NAV_TRAINER : []),
    ...(isAthlete ? NAV_ATHLETE : []),
    ...((isTrainer || isAthlete) ? NAV_COMMUNICATION : []),
    ...(isPartner ? NAV_PARTNER : []),
    ...(isAffiliate ? NAV_AFFILIATE : []),
  ]

  const seen = new Set()
  const deduped = roleLinks.filter(item => {
    if (seen.has(item.href)) return false
    seen.add(item.href)
    return true
  })

  const navigation = [
    { name: t('dashboard'), icon: Trophy, href: '/dashboard' },
    ...deduped,
    ...NAV_COMMON,
  ]

  // ── Label de role do usuário ───────────────────────────────────────────────
  const ROLE_LABELS = [
    { check: () => isTrainer && isAthlete, label: 'Treinador & Atleta' },
    { check: () => isTrainer, label: 'Treinador' },
    { check: () => isPartner, label: 'Parceiro B2B' },
    { check: () => isAffiliate, label: 'Afiliado' },
    { check: () => session?.user?.roles?.includes(ROLES.INDIVIDUAL), label: 'Atleta' },
    { check: () => session?.user?.roles?.includes(ROLES.CLIENT), label: 'Aluno(a)' },
  ]
  const userRoleLabel = ROLE_LABELS.find(r => r.check())?.label ?? 'Usuário'

  // Mostrar card de assinatura apenas para quem tem assinatura/plano relevante
  const showSubscriptionCard = isTrainer || isAthlete || isPartner

  const isActive = (href) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const SidebarContent = () => (
    <div className="flex flex-col flex-grow bg-white border-r border-gray-200 pt-5 h-full">
      {/* Logo */}
      <div className="flex items-center flex-shrink-0 px-4">
        <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
          <Trophy className="w-5 h-5 text-white" />
        </div>
        <span className="ml-2 text-xl font-bold text-gray-900">Player.Action</span>
      </div>

      {/* User info */}
      <div className="mt-5 px-4">
        <div className="flex items-center">
          <img
            className="h-10 w-10 rounded-full object-cover"
            src={session?.user?.image || '/default-avatar.png'}
            alt={session?.user?.name || 'User'}
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <div className="ml-3 overflow-hidden">
            <p className="text-sm font-medium text-gray-900 truncate">{session?.user?.name}</p>
            <p className="text-xs text-gray-500 capitalize">
              {userRoleLabel}
            </p>
            {credits !== null && (
              <p className="text-xs text-yellow-600 font-medium flex items-center gap-1 mt-0.5">
                <Coins className="w-3 h-3" />
                {credits} crédito{credits !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-5 flex-1 px-2 space-y-1">
        {navigation.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`${active
                ? 'bg-green-50 text-green-700 border-r-2 border-green-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors`}
            >
              <Icon className={`mr-3 h-5 w-5 flex-shrink-0 ${active ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-500'}`} />
              {item.name}
              {item.badge ? (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      {/* Subscription status — só para roles que têm assinatura/plano */}
      {showSubscriptionCard && (
        <div className="flex-shrink-0 px-4 pb-2">
          <Link href="/dashboard/subscription">
            <div className={`rounded-lg p-3 cursor-pointer transition-colors ${
              isPartner
                ? 'bg-green-50 border border-green-200 hover:bg-green-100'
                : 'bg-blue-50 border border-blue-200 hover:bg-blue-100'
            }`}>
              <p className={`text-xs font-medium flex items-center gap-1 ${
                isPartner ? 'text-green-800' : 'text-blue-800'
              }`}>
                <Wallet className="w-3 h-3" />
                {isPartner ? 'Parceiro B2B' : 'Assinatura'}
              </p>
              <p className={`text-xs mt-1 underline ${
                isPartner ? 'text-green-600' : 'text-blue-600'
              }`}>
                {isPartner ? 'Ver meu plano →' : 'Gerenciar →'}
              </p>
            </div>
          </Link>
        </div>
      )}

      {/* Footer / Actions */}
      <div className="flex-shrink-0 border-t border-gray-200 p-4 space-y-2">
        <div className="flex w-full items-center justify-between px-2 text-sm text-gray-600">
          <span>Notificações:</span>
          <div data-tour="notification-bell">
            <NotificationBell />
          </div>
        </div>
        <div className="flex w-full items-center justify-between px-2 text-sm text-gray-600">
          <span>Idioma:</span>
          <LanguageSwitcher />
        </div>
        <a
          href="https://wa.me/5551990150483?text=Olá!%20Preciso%20de%20suporte%20no%20Player.Action."
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center w-full px-4 py-2 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 rounded-md transition-colors"
        >
          <svg className="mr-3 h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.135.564 4.14 1.543 5.876L.057 23.997l6.304-1.654A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.895 9.895 0 01-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374A9.861 9.861 0 012.106 12C2.106 6.58 6.58 2.106 12 2.106S21.894 6.58 21.894 12 17.42 21.894 12 21.894z"/>
          </svg>
          Suporte
        </a>
        <Button
          onClick={() => signOut({ callbackUrl: '/' })}
          variant="ghost"
          className="w-full justify-start text-gray-600 hover:text-gray-900"
        >
          <LogOut className="mr-3 h-5 w-5" />
          {t('logout')}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar for desktop */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <SidebarContent />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black bg-opacity-50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        <SidebarContent />
      </div>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <span className="ml-2 text-lg font-bold text-gray-900">Player.Action</span>
          </div>
          <div className="flex items-center gap-2">
            <div data-tour="notification-bell">
              <NotificationBell />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="md:pl-64 flex flex-col flex-1">
        <main className="flex-1">
          <div className="py-6 px-4 sm:px-6 lg:px-8 mt-16 md:mt-0">
            {children}
          </div>
        </main>
      </div>

      {/* Mini Chat flutuante */}
      <MiniChat />
    </div>
  )
}