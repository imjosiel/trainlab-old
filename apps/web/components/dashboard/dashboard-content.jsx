'use client'

import { ADMIN_SYSTEM_ROLES, ROLES } from '@/lib/constants'
import AffiliateHome from '@/components/dashboard/affiliate-home'
import PartnerHome from '@/components/dashboard/partner-home'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, Users, FileText, Plus, TrendingUp, AlertTriangle, BarChart3, ArrowRight, Dumbbell, CheckCircle2, CalendarDays, Video, MapPin, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const PIE_COLORS = ['#16a34a', '#eab308', '#3b82f6', '#a855f7', '#ef4444']

export default function DashboardContent({ session, stats, activePlans = [], affiliateData = null, partnerData = null, nextAppointment = null }) {
  const router = useRouter()
  const t = useTranslations('DashboardContent')

  const STATUS_LABELS = {
    COMPLETED: t('labelCompleted'),
    PENDING: t('labelPending'),
    APPROVED: t('labelApproved'),
    DELIVERED: t('labelDelivered'),
    REJECTED: t('labelRejected'),
  }

  const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)
  const isAthlete = session?.user?.roles?.includes(ROLES.INDIVIDUAL) || session?.user?.roles?.includes(ROLES.CLIENT)
  const isStudent = session?.user?.roles?.includes(ROLES.CLIENT)
  const isPartner = session?.user?.roles?.includes(ROLES.PARTNER) || session?.user?.systemRoles?.includes('ADMIN')
  const isAffiliate = session?.user?.roles?.includes(ROLES.AFFILIATE)
  // Parceiros B2B têm acesso completo — não dependem de subscriptionStatus (modelo legado SaaS)
  const hasSubscription = session?.user?.subscriptionStatus === 'active'
    || session?.user?.subscriptionStatus === 'trialing'
    || (isTrainer && isPartner)
    || session?.user?.systemRoles?.some(r => ADMIN_SYSTEM_ROLES.includes(r))
  const isBase = session?.user?.subscriptionPlan === 'base'

  // Subscription usage warning for BASE plan trainers
  const showUsageWarning = isTrainer && isBase && stats && (
    (stats.subscription?.limits?.maxPlansPerMonth &&
      stats.plansThisMonth >= stats.subscription.limits.maxPlansPerMonth * 0.8) ||
    (stats.subscription?.limits?.maxAthletes &&
      stats.totalAthletes >= stats.subscription.limits.maxAthletes * 0.8)
  )

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          {t('welcomeTitle', { name: session?.user?.name?.split(' ')[0] })}
        </h1>
        <p className="text-gray-600 mt-1">
          {isTrainer
            ? t('welcomeTrainer')
            : t('welcomeAthlete')}
        </p>
      </div>

      {/* Subscription warning — só para treinadores sem assinatura SaaS ativa */}
      {isTrainer && !hasSubscription && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t('subPendingTitle')}
            </CardTitle>
            <CardDescription className="text-yellow-700">
              {t('subPendingDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/subscription">
              <Button className="bg-green-600 hover:bg-green-700">
                {t('subPendingBtn')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Limit warning for BASE plan */}
      {showUsageWarning && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t('baseWarningTitle')}
            </CardTitle>
            <CardDescription className="text-orange-700">
              {t('baseWarningDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Link href="/#pricing">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white">{t('baseWarningUpgradeBtn')}</Button>
            </Link>
            <Button variant="outline" onClick={() => router.push('/dashboard/settings')}>
              {t('baseWarningDetailsBtn')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Renderização por Role ────────────────────────────────────── */}
      {isTrainer && isAthlete ? (
        /* Treinador + Atleta: tabs */
        <Tabs defaultValue="trainer" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="trainer">Painel do Treinador</TabsTrigger>
            <TabsTrigger value="athlete">Painel do Atleta</TabsTrigger>
          </TabsList>

          <TabsContent value="trainer" className="space-y-6">
            {renderTrainerStats()}
            {renderTrainerCharts()}
            {renderSharedActions(true)}
          </TabsContent>

          <TabsContent value="athlete" className="space-y-6">
            {renderAthleteStats()}
            {renderAthleteActivePlan()}
            {renderSharedActions(false)}
          </TabsContent>
        </Tabs>
      ) : isTrainer ? (
        /* Treinador puro */
        <div className="space-y-6">
          {renderNextAppointment()}
          {renderTrainerStats()}
          {renderTrainerCharts()}
          {renderSharedActions(true)}
        </div>
      ) : isAthlete ? (
        /* Atleta/Aluno puro */
        <div className="space-y-6">
          {renderNextAppointment()}
          {renderAthleteStats()}
          {renderAthleteActivePlan()}
          {renderSharedActions(false)}
        </div>
      ) : isPartner && !isAffiliate ? (
        /* Parceiro B2B puro */
        <PartnerHome data={partnerData} />
      ) : isAffiliate && !isPartner ? (
        /* Afiliado puro */
        <AffiliateHome data={affiliateData} />
      ) : isAffiliate && isPartner ? (
        /* Afiliado + Parceiro */
        <Tabs defaultValue="partner" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="partner">Painel do Parceiro</TabsTrigger>
            <TabsTrigger value="affiliate">Painel do Afiliado</TabsTrigger>
          </TabsList>
          <TabsContent value="partner" className="space-y-6">
            <PartnerHome data={partnerData} />
          </TabsContent>
          <TabsContent value="affiliate" className="space-y-6">
            <AffiliateHome data={affiliateData} />
          </TabsContent>
        </Tabs>
      ) : (
        /* Fallback — não deveria acontecer, mas é seguro */
        <div className="space-y-6">
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">Bem-vindo ao Player.Action</h3>
              <p className="text-gray-500 text-sm">Seu perfil está sendo configurado.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )

  function renderNextAppointment() {
    if (!nextAppointment) return null

    const apt     = nextAppointment
    const date    = new Date(apt.scheduledAt)
    const dayName = date.toLocaleDateString('pt-BR', { weekday: 'long' })
    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
    const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    return (
      <Card className="border-green-100 bg-gradient-to-r from-green-50 to-emerald-50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-green-600" />
              <CardTitle className="text-sm font-medium text-green-800">Próxima Sessão</CardTitle>
            </div>
            <Link href="/dashboard/appointments" className="text-xs text-green-700 hover:underline flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <h3 className="font-semibold text-gray-900 text-base mb-2">{apt.title}</h3>
          <div className="space-y-1.5 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="capitalize">{dayName}, {dateStr} às {timeStr} · {apt.durationMinutes} min</span>
            </div>
            {apt.googleMeetLink && (
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-green-600 flex-shrink-0" />
                <a href={apt.googleMeetLink} target="_blank" rel="noopener noreferrer" className="text-green-700 font-medium hover:underline">
                  Entrar no Google Meet
                </a>
              </div>
            )}
            {apt.location && !apt.googleMeetLink && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span>{apt.location}</span>
              </div>
            )}
            {(apt.trainer?.name || apt.student?.name) && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span>{isTrainer ? (apt.student?.name ?? apt.athlete?.name) : apt.trainer?.name}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  function renderTrainerStats() {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isTrainer && (
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t('statsTotalAthletes')}
              </CardTitle>
              <Users className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.totalAthletes ?? 0}
              </div>
              <p className="text-xs text-gray-500 mt-1">{t('statsAthletesDesc')}</p>
              {isBase && stats?.subscription?.limits?.maxAthletes && (
                <Progress
                  value={Math.min(((stats.totalAthletes ?? 0) / stats.subscription.limits.maxAthletes) * 100, 100)}
                  className="mt-2 h-1"
                />
              )}
            </CardContent>
          </Card>
        )}

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              {isTrainer ? t('statsPlansCreated') : t('statsMyPlans')}
            </CardTitle>
            <FileText className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.totalPlans ?? 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">{t('statsPlansTotalDesc')}</p>
          </CardContent>
        </Card>

        {isTrainer && (
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t('statsThisMonth')}
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.plansThisMonth ?? 0}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {isBase && stats?.subscription?.limits?.maxPlansPerMonth
                  ? t('statsOfAvailable', { limit: stats.subscription.limits.maxPlansPerMonth })
                  : t('statsMonthDesc')}
              </p>
              {isBase && stats?.subscription?.limits?.maxPlansPerMonth && (
                <Progress
                  value={Math.min(((stats.plansThisMonth ?? 0) / stats.subscription.limits.maxPlansPerMonth) * 100, 100)}
                  className="mt-2 h-1"
                />
              )}
            </CardContent>
          </Card>
        )}

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              {t('statsActivePlans')}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.activePlans ?? 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">{t('statsActiveDesc')}</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              {t('statsCompleted')}
            </CardTitle>
            <Trophy className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.completedPlans ?? 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">{t('statsCompletedDesc')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  function renderAthleteStats() {
    return (
      <>
        {/* Athlete specific upper stats */}
        {isAthlete && stats?.athleteStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-orange-800 text-base flex items-center gap-2">
                  <span className="text-2xl">🔥</span> {t('statsStreak')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">
                  {stats.athleteStats.streak} {t('statsDays', { count: stats.athleteStats.streak })}
                </div>
                <p className="text-sm text-orange-700 mt-1">
                  {t('statsStreakDesc')}
                </p>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-blue-800 text-base flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" /> {t('statsCompletionRate')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {stats.athleteStats.completionRate}%
                </div>
                <p className="text-sm text-blue-700 mt-1">
                  {t('statsCompletionDesc')}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </>
    )
  }

  function renderAthleteActivePlan() {
    return (
      <div className="space-y-4">
        {/* Athlete active plan progress cards */}
        {isAthlete && activePlans.length > 0 && activePlans.map((plan) => (
          <Card key={plan.id} className={plan.status === 'COMPLETED' ? 'border-green-400 bg-green-50' : 'border-green-200'}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex flex-col gap-1 text-base w-full">
                  <div className="flex items-center justify-between w-full">
                    <span className="flex items-center gap-2">
                      {plan.status === 'COMPLETED'
                        ? <><Trophy className="w-5 h-5 text-yellow-500" /> {t('planCompleted')}</>
                        : <><Dumbbell className="w-5 h-5 text-green-600" /> {t('planActive')}</>}
                    </span>
                    <span className="text-xl font-bold text-green-600">
                      {plan.progress?.percent ?? 0}%
                    </span>
                  </div>
                  {plan.trainer && (
                    <span className="text-xs font-normal text-gray-500 mt-1 block">Treinador: <b>{plan.trainer.name}</b></span>
                  )}
                </CardTitle>
              </div>
              <CardDescription className="truncate">{plan.title}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={plan.progress?.percent ?? 0} className="h-2" />
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  {t('planSessionsOf', { completed: plan.progress?.completed ?? 0, total: plan.progress?.total ?? 0 })}
                </span>
                <button
                  className="text-green-600 underline text-sm flex items-center gap-1"
                  onClick={() => router.push('/dashboard/my-plan')}
                >
                  {t('planViewBtn')} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}

        {isAthlete && activePlans.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <Dumbbell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">{t('noPlanTitle')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('noPlanDesc')}</p>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  function renderTrainerCharts() {
    return (
      <>
        {/* Recharts — Plans created per month (trainer only) */}
        {isTrainer && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-green-600" />
                  {t('chartPlansTitle')}
                </CardTitle>
                <CardDescription>{t('chartPlansDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.plansByMonth?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats.plansByMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                      <Bar dataKey="planos" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-12">{t('chartNoMonthlyData')}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  {t('chartAthletesTitle')}
                </CardTitle>
                <CardDescription>{t('chartAthletesDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.athletesByMonth?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={stats.athletesByMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                      <Line type="monotone" dataKey="atletas" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-12">{t('chartNoAthleteData')}</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-purple-600" />
                  {t('chartStatusTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats?.plansByStatus && Object.values(stats.plansByStatus).some(v => v > 0) ? (
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(stats.plansByStatus).filter(([k, v]) => v > 0).map(([name, value]) => ({ name, value }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {Object.entries(stats.plansByStatus)
                            .filter(([_, v]) => v > 0)
                            .map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name) => [value, STATUS_LABELS[name] || name]}
                          contentStyle={{ borderRadius: 8 }}
                        />
                        <Legend formatter={(value) => STATUS_LABELS[value] || value} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-12">{t('chartNoStatusData')}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </>
    )
  }

  function renderSharedActions(isTrainerRole) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('actionsTitle')}</CardTitle>
            <CardDescription>
              {isTrainerRole
                ? t('actionsTrainerDesc')
                : t('actionsAthleteDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isTrainerRole ? (
              <>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => router.push('/dashboard/students')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('actionManageAthletes')}
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => router.push('/dashboard/plans/create')}
                  disabled={!hasSubscription}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {t('actionCreatePlan')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => router.push('/dashboard/plans')}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {t('actionViewPlans')}
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => router.push('/dashboard/profile')}
                >
                  <Trophy className="mr-2 h-4 w-4" />
                  {t('actionEditProfile')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle>{t('activityTitle')}</CardTitle>
            <CardDescription>{t('activityDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {(stats?.totalPlans ?? 0) === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                {isTrainerRole ? (
                  <>
                    {t('activityEmptyTrainer1')}
                    <button
                      className="text-green-600 underline"
                      onClick={() => router.push('/dashboard/plans/create')}
                    >
                      {t('activityEmptyTrainer2')}
                    </button>
                  </>
                ) : (
                  t('activityEmptyAthlete')
                )}
              </p>
            ) : (
              <div className="flex items-center justify-between py-2">
                <p className="text-sm text-gray-500">
                  {t('activityCountPrefix')} <strong>{stats?.totalPlans}</strong>{' '}
                  {t('activityCountPlural', { count: stats?.totalPlans })}
                </p>
                <button
                  className="text-green-600 underline text-sm flex items-center gap-1"
                  onClick={() => router.push('/dashboard/plans')}
                >
                  {t('activityViewAll')} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }
}