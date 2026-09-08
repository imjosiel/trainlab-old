'use client'

import { ROLES } from '@/lib/constants'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import {
    Loader2, Zap, Shield, Users, FileText, CheckCircle2,
    ArrowRight, CreditCard, AlertCircle, Star, TrendingUp, X
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY)

function UsageMeter({ label, icon: Icon, current, max }) {
    const isUnlimited = max === null
    const percent = isUnlimited ? 0 : Math.min((current / max) * 100, 100)
    const isWarning = !isUnlimited && percent >= 80
    const isLimit = !isUnlimited && percent >= 100

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-gray-600">
                    <Icon className="w-4 h-4" />
                    {label}
                </span>
                <span className={`font-semibold ${isLimit ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-gray-900'}`}>
                    {isUnlimited ? (
                        <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Ilimitado</span>
                    ) : `${current} / ${max}`}
                </span>
            </div>
            {!isUnlimited && (
                <Progress
                    value={percent}
                    className={`h-2 ${isLimit ? 'bg-red-100' : isWarning ? 'bg-orange-100' : 'bg-gray-100'}`}
                />
            )}
        </div>
    )
}

export default function SubscriptionPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const searchParams = useSearchParams()
    const [planStatus, setPlanStatus] = useState(null)
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [availableTiers, setAvailableTiers] = useState([])
    const [changingTier, setChangingTier] = useState(null)
    const [checkoutSecret, setCheckoutSecret] = useState(null)

    // Verifica tier após retorno do checkout embutido
    useEffect(() => {
        if (searchParams.get('tier_success') !== 'true') return
        const sessionId = searchParams.get('session_id')
        router.replace('/dashboard/subscription')

        const verifyAndReload = async () => {
            if (sessionId) {
                try {
                    const res = await fetch(`/api/backend/partner/tier-request/verify?session_id=${sessionId}`)
                    const data = await res.json()
                    if (data.updated) {
                        toast.success(`Tier atualizado para "${data.tierName}" com sucesso!`)
                    } else if (data.alreadyCurrent) {
                        toast.success(`Seu tier já está atualizado para "${data.tierName}".`)
                    } else {
                        toast.success('Pagamento confirmado! Aguardando atualização do tier...')
                    }
                } catch {
                    toast.success('Pagamento confirmado! Seu tier será atualizado em instantes.')
                }
            } else {
                toast.success('Pagamento confirmado! Seu tier será atualizado em instantes.')
            }
            // Recarrega dados da página
            setTimeout(() => window.location.reload(), 1200)
        }

        verifyAndReload()
    }, [searchParams, router])

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/')
    }, [status, router])

    useEffect(() => {
        if (status === 'authenticated') {
            Promise.all([
                fetch('/api/backend/user/plan-status').then(r => r.ok ? r.json() : null),
                fetch('/api/backend/dashboard/stats').then(r => r.ok ? r.json() : null),
                fetch('/api/backend/partner/tiers').then(r => r.ok ? r.json() : null),
            ]).then(([planData, statsData, tiersData]) => {
                setPlanStatus(planData)
                setStats(statsData)
                if (tiersData?.tiers) setAvailableTiers(tiersData.tiers)
            }).catch(console.error).finally(() => setLoading(false))
        }
    }, [status])

    const fetchClientSecret = useCallback(() => Promise.resolve(checkoutSecret), [checkoutSecret])

    const handleTierChange = async (toTierId) => {
        setChangingTier(toTierId)
        try {
            const res = await fetch('/api/backend/partner/tier-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toTierId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao processar.')

            // Tier pago → abre Embedded Checkout
            if (data.requiresPayment && data.clientSecret) {
                setCheckoutSecret(data.clientSecret)
                setChangingTier(null)
                return
            }

            toast.success(data.message)
            // Recarrega apenas quando a troca foi imediata (tier gratuito com auto-approve)
            if (data.immediate !== false) {
                setTimeout(() => window.location.reload(), 800)
            } else {
                setChangingTier(null)
            }
        } catch (err) {
            toast.error(err.message)
            setChangingTier(null)
        }
    }

    // Modal de checkout embutido
    if (checkoutSecret) {
        return (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto p-4 pt-8">
                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl">
                    <div className="flex items-center justify-between px-6 py-4 border-b">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Assinar Plano</h2>
                            <p className="text-sm text-gray-500">Pagamento seguro via Stripe</p>
                        </div>
                        <button
                            onClick={() => setCheckoutSecret(null)}
                            className="rounded-full p-2 hover:bg-gray-100 transition-colors"
                            aria-label="Fechar"
                        >
                            <X className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>
                    <div className="p-4">
                        <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
                            <EmbeddedCheckout />
                        </EmbeddedCheckoutProvider>
                    </div>
                </div>
            </div>
        )
    }

    if (status === 'loading' || loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />

            </div>
        )
    }

    if (!planStatus) return null

    // ────── TREINADOR B2B ──────────────────────────────────────────────────────
    if (planStatus.userType === 'PARTNER' || planStatus.userType === 'ADMIN') {
        const tier = planStatus.tier

        // Fix #5: guard para tier undefined — admin sem PartnerAccount pode cair aqui
        if (!tier) {
            return (
                <div className="flex items-center justify-center min-h-[400px]">
                    <p className="text-gray-500">Plano não configurado para esta conta.</p>
                </div>
            )
        }

        const athleteCount = stats?.totalAthletes ?? 0
        const plansThisMonth = stats?.plansThisMonth ?? 0

        return (
            <div className="space-y-8 max-w-4xl mx-auto">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Meu Plano de Parceiro</h1>
                    <p className="text-gray-600 mt-1">
                        Gerencie seu plano na plataforma Player.Action como treinador parceiro.
                    </p>
                </div>

                {/* Plan Card */}
                <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 overflow-hidden">
                    <CardHeader>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                                    <Shield className="w-6 h-6 text-green-600" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl text-gray-900">
                                        Plano {tier.name}
                                    </CardTitle>
                                    <CardDescription className="text-green-700">
                                        {tier.description}
                                    </CardDescription>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-3xl font-black text-gray-900">
                                    {tier.price === 0 ? 'Gratuito' : `R$ ${tier.price?.toFixed(2)}`}
                                </p>
                                {tier.price > 0 && <p className="text-xs text-gray-500">/mês</p>}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3 flex-wrap">
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                                <Star className="w-3 h-3 mr-1" />
                                {planStatus.isApproved ? 'Parceiro Aprovado' : 'Parceiro Pendente'}
                            </Badge>
                            {!planStatus.stripeSetup?.chargesEnabled && (
                                <Badge variant="outline" className="border-orange-300 text-orange-700 bg-orange-50">
                                    <AlertCircle className="w-3 h-3 mr-1" />
                                    Pagamentos não configurados
                                </Badge>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Usage Meters */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-green-600" />
                            Uso do Plano
                        </CardTitle>
                        <CardDescription>Acompanhe seus limites mensais.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {/* Alunos — sempre um medidor simples */}
                        <UsageMeter
                            label="Alunos cadastrados"
                            icon={Users}
                            current={athleteCount}
                            max={tier.maxAthletes}
                        />

                        {/* Planos — lógica diferente por modo */}
                        {tier.maxPlansPerMonth === null ? (
                            // Sem limite de planos
                            <UsageMeter
                                label="Planos de treino criados"
                                icon={FileText}
                                current={plansThisMonth}
                                max={null}
                            />
                        ) : tier.allowFlexibleDistribution ? (
                            // Pool flexível: mostrar uso total vs pool (limite × alunos)
                            <UsageMeter
                                label={`Planos totais este mês (pool compartilhado)`}
                                icon={FileText}
                                current={plansThisMonth}
                                max={tier.maxPlansPerMonth * Math.max(athleteCount, 1)}
                            />
                        ) : (
                            // Por aluno: NÃO é um contador agregado — é uma regra por aluno
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="flex items-center gap-1.5 text-gray-600">
                                        <FileText className="w-4 h-4" />
                                        Planos de treino
                                    </span>
                                    <span className="font-semibold text-gray-900">
                                        {plansThisMonth} criados este mês
                                    </span>
                                </div>
                                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 flex items-start gap-3">
                                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Limite de <strong>{tier.maxPlansPerMonth} planos/mês por aluno</strong>.
                                        Cada aluno tem seu próprio contador independente — um aluno não interfere no limite do outro.
                                    </p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Upgrade (futuro) */}
                {planStatus.canUpgrade && (
                    <Card className="border-yellow-200 bg-yellow-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-yellow-800">
                                <Zap className="w-5 h-5" />
                                Planos Disponíveis para Upgrade
                            </CardTitle>
                            <CardDescription className="text-yellow-700">
                                Desbloqueie mais funcionalidades com um plano avançado.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button className="bg-yellow-500 hover:bg-yellow-600 text-white">
                                Ver Planos Avançados <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Stripe Setup Nudge */}
                {!planStatus.stripeSetup?.chargesEnabled && planStatus.isApproved && (
                    <Card className="border-blue-200 bg-blue-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-blue-800">
                                <CreditCard className="w-5 h-5" />
                                Configure seus Recebimentos
                            </CardTitle>
                            <CardDescription className="text-blue-700">
                                Para criar ofertas e receber pagamentos dos alunos, configure sua conta bancária.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Link href="/dashboard/partner/onboarding">
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                                    Configurar Conta Bancária <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                )}
                {/* Tier grid */}
                {availableTiers.length > 1 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Zap className="w-5 h-5 text-blue-500" />
                                Planos Disponíveis
                            </CardTitle>
                            <p className="text-sm text-gray-500">Mude ou faça upgrade do seu plano de parceiro.</p>
                        </CardHeader>
                        <CardContent>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {availableTiers.map(t => {
                                    const isCurrent = t.slug === tier.slug
                                    const isProcessing = changingTier === t.id
                                    return (
                                        <div key={t.id} className={`relative rounded-xl border p-4 flex flex-col gap-3 transition-shadow ${
                                            isCurrent ? 'border-green-400 bg-green-50 shadow-sm' : 'border-gray-200 hover:shadow-md'
                                        }`}>
                                            {isCurrent && (
                                                <span className="absolute -top-2.5 left-3 px-2 py-0.5 bg-green-600 text-white text-[10px] font-bold rounded-full">Plano Atual</span>
                                            )}
                                            <div>
                                                <p className="font-semibold text-gray-900">{t.name}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                                            </div>
                                            <div className="flex-1 space-y-1 text-xs text-gray-600">
                                                <p>💰 Comissão: {Math.round(t.commissionRate * 100)}%</p>
                                                <p>👥 Alunos: {t.maxAthletes ? t.maxAthletes : 'Ilimitado'}</p>
                                                <p>📋 Planos/mês/aluno: {t.maxPlansPerMonth ?? 'Ilimitado'}</p>
                                                {t.allowHourlyRate && <p>✅ Taxa de serviço permitida</p>}
                                            </div>
                                            <div className="pt-1">
                                                <p className="text-lg font-bold text-gray-900">
                                                    {t.price === 0 ? 'Gratuito' : `R$ ${t.price.toFixed(2)}/mês`}
                                                </p>
                                            </div>
                                            {!isCurrent && (
                                                <button
                                                    onClick={() => handleTierChange(t.id)}
                                                    disabled={!!changingTier}
                                                    className={`text-sm font-medium rounded-lg px-4 py-2 transition-colors disabled:opacity-50 ${
                                                        t.price === 0
                                                            ? 'bg-gray-700 hover:bg-gray-800 text-white'
                                                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                                                    }`}
                                                >
                                                    {isProcessing
                                                        ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                                                        : t.price === 0 ? 'Mudar para este Plano' : 'Fazer Upgrade'}
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        )
    }

    // ────── ALUNO B2B → redireciona para /billing ──────────────────────────────
    if (planStatus.userType === ROLES.CLIENT) {
        router.replace('/dashboard/billing')
        return null
    }

    // ────── SEM ASSINATURA ──────────────────────────────────────────────────────
    return (
        <div className="space-y-8 max-w-3xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Assinatura</h1>
                <p className="text-gray-600 mt-1">Você ainda não possui uma assinatura ativa.</p>
            </div>

            <Card className="bg-gray-50 border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <AlertCircle className="w-14 h-14 text-gray-300 mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Nenhuma assinatura encontrada</h2>
                    <p className="text-gray-500 max-w-sm mb-6">
                        Para acessar os planos de treino, você precisa assinar um plano com seu treinador.
                    </p>
                    <Link href="/dashboard/billing">
                        <Button className="bg-green-600 hover:bg-green-700">
                            <CreditCard className="w-4 h-4 mr-2" />
                            Ver Planos Disponíveis
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    )
}
