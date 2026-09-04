'use client'

import { ROLES } from '@/lib/constants'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, CreditCard, Zap, Shield, Users, FileText, CheckCircle, ExternalLink, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { HelpCircle } from 'lucide-react'
import Link from 'next/link'

function UsageMeter({ label, icon: Icon, current, max, unit, unlimitedText }) {
    const percentage = max ? Math.min((current / max) * 100, 100) : 0
    const isWarning = max && percentage >= 80
    const isLimit = max && percentage >= 100

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-gray-600">
                    <Icon className="w-4 h-4" />
                    {label}
                </span>
                <span className={`font-medium ${isLimit ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-gray-900'}`}>
                    {max === null ? (
                        <span className="text-green-600">{unlimitedText}</span>
                    ) : (
                        `${current} / ${max} ${unit}`
                    )}
                </span>
            </div>
            {max !== null && (
                <Progress
                    value={percentage}
                    className={`h-2 ${isLimit ? 'bg-red-100' : isWarning ? 'bg-orange-100' : 'bg-gray-100'}`}
                />
            )}
        </div>
    )
}

function SettingsContent({ session }) {
    const router = useRouter()
    const t = useTranslations('SettingsPage')
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [portalLoading, setPortalLoading] = useState(false)

    const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)
    // Aluno B2B: tem role STUDENT mas não TRAINER — não deve ver seções de assinatura SaaS
    const isStrictlyStudent = !isTrainer && session?.user?.roles?.includes(ROLES.CLIENT)
    const hasSubscription = session?.user?.subscriptionStatus === 'active' || session?.user?.subscriptionStatus === 'trialing'
    const isPremium = session?.user?.subscriptionPlan === 'premium'
    const isBase = session?.user?.subscriptionPlan === 'base'
    const [tiers, setTiers] = useState([])
    const [planStatus, setPlanStatus] = useState(null)
    // Parceiros B2B aprovados não têm SaaS subscription, mas são considerados ativos
    const isPartnerActive = planStatus?.userType === 'PARTNER' || planStatus?.userType === 'ADMIN'

    useEffect(() => {
        fetchStats()
        fetchTiers()
        fetch('/api/backend/user/plan-status').then(r => r.ok ? r.json() : null).then(setPlanStatus)
    }, [])

    const fetchTiers = async () => {
        try {
            const res = await fetch('/api/backend/admin/tiers')
            if (res.ok) {
                const data = await res.json()
                setTiers(data.tiers || [])
            }
        } catch (err) {
            console.error(err)
        }
    }

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/backend/dashboard/stats')
            if (res.ok) {
                const data = await res.json()
                setStats(data)
            }
        } catch (err) {
            console.error('Error fetching stats:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleManageSubscription = async () => {
        setPortalLoading(true)
        try {
            const res = await fetch('/api/backend/stripe/portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnUrl: `${window.location.origin}/dashboard/settings` }),
            })
            const data = await res.json()
            if (data.url) {
                window.location.href = data.url
            } else {
                alert(t('errorOpenPortal'))
            }
        } catch (err) {
            console.error('Error opening portal:', err)
            alert(t('errorOpenPortal'))
        } finally {
            setPortalLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
                <p className="text-gray-600 mt-1">{t('subtitle')}</p>
            </div>

            {/* Current Plan Card — só para treinadores SaaS, não para alunos B2B */}
            {!isStrictlyStudent && <Card className={isPremium ? 'border-yellow-300 bg-gradient-to-br from-yellow-50 to-amber-50' : hasSubscription ? 'border-green-200 bg-green-50' : 'border-gray-200'}>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            {isPremium ? (
                                <><Zap className="w-5 h-5 text-yellow-500" /> {t('titlePremium')}</>
                            ) : isBase ? (
                                <><Shield className="w-5 h-5 text-green-600" /> {t('titleBase')}</>
                            ) : (
                                <><CreditCard className="w-5 h-5 text-gray-500" /> {t('titleNone')}</>
                            )}
                        </CardTitle>
                        <Badge
                            className={
                                isPartnerActive
                                    ? 'bg-green-600 text-white'
                                    : hasSubscription
                                        ? isPremium
                                            ? 'bg-yellow-500 text-white'
                                            : 'bg-green-600 text-white'
                                        : 'bg-gray-200 text-gray-700'
                            }
                        >
                            {isPartnerActive
                                ? 'Parceiro B2B Ativo'
                                : session?.user?.subscriptionStatus === 'trialing'
                                    ? t('badgeTrial')
                                    : hasSubscription ? t('badgeActive') : t('badgeInactive')}
                        </Badge>
                    </div>
                    <CardDescription>
                        {isPremium
                            ? t('descPremium')
                            : isBase
                                ? t('descBase')
                                : t('descNone')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {hasSubscription ? (
                        <Button
                            onClick={handleManageSubscription}
                            disabled={portalLoading}
                            variant={isPremium ? 'default' : 'outline'}
                            className={isPremium ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : ''}
                        >
                            {portalLoading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <ExternalLink className="w-4 h-4 mr-2" />
                            )}
                            {t('btnManageSub')}
                        </Button>
                    ) : (
                        <Link href={isTrainer ? "/dashboard/subscription" : "/dashboard/billing"}>
                            <Button className="bg-green-600 hover:bg-green-700">
                                <ArrowRight className="w-4 h-4 mr-2" />
                                {planStatus?.userType === 'PARTNER' ? 'Ver Meu Plano de Parceiro' : t('btnViewPlans')}
                            </Button>
                        </Link>
                    )}
                    {isBase && (
                        <Link href={isTrainer ? "/dashboard/subscription" : "/dashboard/billing"}>
                            <Button variant="link" className="text-green-600 px-0">
                                {t('linkUpgrade')}
                            </Button>
                        </Link>
                    )}
                </CardContent>
            </Card>}

            {/* Usage Meters — trainer with subscription */}
            {isTrainer && hasSubscription && (
                <Card>
                    <CardHeader>
                        <CardTitle>{t('titleUsage')}</CardTitle>
                        <CardDescription>{t('descUsage')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {loading ? (
                            <div className="space-y-4">
                                {[1, 2].map(i => (
                                    <div key={i} className="space-y-2">
                                        <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
                                        <div className="h-2 bg-gray-200 rounded animate-pulse" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <>
                                <UsageMeter
                                    label={t('labelPlansCreated')}
                                    icon={FileText}
                                    current={stats?.subscription?.usage?.plansThisMonth ?? 0}
                                    max={stats?.subscription?.limits?.maxPlansPerMonth ?? null}
                                    unit={t('unitPlans')}
                                    unlimitedText={t('unlimited')}
                                />
                                <UsageMeter
                                    label={t('labelAthletesRegistered')}
                                    icon={Users}
                                    current={stats?.subscription?.usage?.athletes ?? 0}
                                    max={stats?.subscription?.limits?.maxAthletes ?? null}
                                    unit={t('unitAthletes')}
                                    unlimitedText={t('unlimited')}
                                />
                            </>
                        )}

                        {/* Upgrade nudge */}
                        {isBase && stats && (
                            (() => {
                                const plansPct = stats.subscription?.limits?.maxPlansPerMonth
                                    ? (stats.subscription.usage.plansThisMonth / stats.subscription.limits.maxPlansPerMonth) * 100
                                    : 0
                                const athletesPct = stats.subscription?.limits?.maxAthletes
                                    ? (stats.subscription.usage.athletes / stats.subscription.limits.maxAthletes) * 100
                                    : 0
                                if (plansPct >= 80 || athletesPct >= 80) {
                                    return (
                                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mt-2">
                                            <p className="text-sm font-medium text-orange-800">
                                                {t('warningLimitTitle')}
                                            </p>
                                            <p className="text-xs text-orange-600 mt-1">
                                                {t('warningLimitDesc')}
                                            </p>
                                            <Link href="/dashboard/subscription">
                                                <Button size="sm" className="mt-2 bg-orange-500 hover:bg-orange-600 text-white">
                                                    {t('btnUpgrade')}
                                                </Button>
                                            </Link>
                                        </div>
                                    )
                                }
                                return null
                            })()
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Plan comparison — só para treinadores SaaS, não para alunos B2B */}
            {!isStrictlyStudent && <Card>
                <CardHeader>
                    <CardTitle>{t('titleComparison')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tiers.filter(t => t.isActive && (t.targetRole === (session?.user?.roles?.[0] || ROLES.INDIVIDUAL) || t.targetRole === 'BOTH')).map(tier => {
                            const isCurrentPlan = session?.user?.subscriptionPlan === tier.name.toLowerCase()
                            const isActiveCurrent = isCurrentPlan || (tier.name.toLowerCase() === 'base' && !isPremium)

                            return (
                                <div key={tier.id} className={`relative rounded-lg border p-4 ${isCurrentPlan ? 'border-green-400 bg-green-50 shadow-sm' : 'border-gray-200'}`}>
                                    {isCurrentPlan && (
                                        <div className="absolute -top-3 left-4 px-2 py-0.5 bg-green-100 text-green-800 text-xs font-bold rounded shadow-sm border border-green-200">
                                            {t('badgeCurrentPlan')}
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between mb-3 mt-1">
                                        <p className="font-semibold text-gray-900">{tier.name} {tier.isPopular ? '⭐' : ''}</p>
                                        <p className="text-lg font-bold text-gray-700">R$ {tier.price.toFixed(0)}<span className="text-xs font-normal text-gray-500">{t('perMonth')}</span></p>
                                    </div>
                                    <ul className="space-y-1.5 text-sm text-gray-600">
                                        <li className="flex items-center gap-1.5">
                                            <CheckCircle className={`w-4 h-4 flex-shrink-0 ${isCurrentPlan ? 'text-green-500' : 'text-gray-400'}`} />
                                            {tier.maxPlansPerMonth > 900 ? t('unlimitedPlans') : t('limitPlans', { count: tier.maxPlansPerMonth })}
                                        </li>
                                        {tier.targetRole !== ROLES.INDIVIDUAL && (
                                            <li className="flex items-center gap-1.5">
                                                <CheckCircle className={`w-4 h-4 flex-shrink-0 ${isCurrentPlan ? 'text-green-500' : 'text-gray-400'}`} />
                                                {tier.maxAthletes > 900 ? t('unlimitedAthletes') : t('limitAthletes', { count: tier.maxAthletes })}
                                            </li>
                                        )}
                                        {tier.features.slice(0, 4).map(f => (
                                            <li key={f} className="flex items-start gap-1.5 line-clamp-2 leading-tight">
                                                <CheckCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isCurrentPlan ? 'text-green-500' : 'text-gray-400'}`} />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>}

            {/* Interface & Preferences */}
            <Card>
                <CardHeader>
                    <CardTitle>Preferências de Interface</CardTitle>
                    <CardDescription>Ajustes visuais e de navegação da plataforma.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                        <div className="space-y-1">
                            <p className="font-medium text-gray-900 flex items-center gap-2">
                                <HelpCircle className="w-4 h-4 text-green-600" />
                                Tour da Plataforma
                            </p>
                            <p className="text-sm text-gray-600">
                                Reveja o passo-a-passo explicando os recursos do Player.Action.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => {
                                const userId = session?.user?.id
                                if (userId) {
                                    localStorage.removeItem(`hasSeenTour_${userId}`)
                                }
                                window.location.href = '/dashboard'
                            }}
                        >
                            Reiniciar Tour
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export default function SettingsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/')
    }, [status, router])

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        )
    }

    if (!session) return null

    return <SettingsContent session={session} />
}
