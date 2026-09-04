'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, CreditCard, CheckCircle2, AlertCircle, ShoppingCart, Gift, X, XCircle, Clock, Zap, Calendar, TrendingUp, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY)

export default function StudentBillingPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const searchParams = useSearchParams()
    const t = useTranslations('Navigation')

    const [loading, setLoading] = useState(true)
    const [subscriptions, setSubscriptions] = useState([])
    const [trainers, setTrainers] = useState([])
    const [systemSettings, setSystemSettings] = useState(null)
    const [trialLoading, setTrialLoading] = useState(null)
    const [checkoutSecret, setCheckoutSecret] = useState(null)
    const [checkoutOfferId, setCheckoutOfferId] = useState(null)
    const [checkoutLoading, setCheckoutLoading] = useState(null)
    const [cancelingSub, setCancelingSub] = useState(null)
    const [isCanceling, setIsCanceling] = useState(false)
    const [reactivating, setReactivating] = useState(null)
    // Opção B — troca de plano
    const [switchDialog, setSwitchDialog] = useState(null) // { sub, targetOffer, isUpgrade }
    const [isSwitching, setIsSwitching] = useState(false)

    const fetchClientSecret = useCallback(() => Promise.resolve(checkoutSecret), [checkoutSecret])

    useEffect(() => { fetchData() }, [])

    useEffect(() => {
        if (searchParams.get('sub_success') !== 'true') return
        const sessionId = searchParams.get('session_id')
        const offerId   = searchParams.get('offer_id')
        router.replace('/dashboard/billing')
        const verifyAndReload = async () => {
            if (sessionId && offerId) {
                try {
                    const res  = await fetch(`/api/backend/partner/offers/${offerId}/checkout/verify?session_id=${sessionId}`)
                    const data = await res.json()
                    if (data.created) toast.success(`Assinatura de "${data.offerName}" ativada!`)
                    else if (data.alreadyExists) toast.success('Assinatura já estava ativa.')
                    else toast.success('Pagamento confirmado! Sua assinatura será ativada em instantes.')
                } catch { toast.success('Pagamento confirmado!') }
            } else { toast.success('Pagamento confirmado!') }
            setTimeout(() => window.location.reload(), 1200)
        }
        verifyAndReload()
    }, [searchParams, router])

    const fetchData = async () => {
        try {
            const res = await fetch('/api/backend/user/subscriptions')
            if (res.ok) {
                const data = await res.json()
                setSubscriptions(data.subscriptions || [])
                setTrainers(data.trainers || [])
                setSystemSettings(data.systemSettings)
            }
        } catch { toast.error('Erro ao carregar assinaturas') }
        finally { setLoading(false) }
    }

    const handleSubscribe = async (offer) => {
        setCheckoutLoading(offer.id)
        try {
            const res = await fetch(`/api/backend/partner/offers/${offer.id}/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: session?.user?.email })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao iniciar checkout')
            if (data.free) {
                toast.success(`✅ Assinado! Bem-vindo ao plano "${offer.name}".`)
                setCheckoutLoading(null)
                fetchData()
                return
            }
            if (data.clientSecret) { setCheckoutOfferId(offer.id); setCheckoutSecret(data.clientSecret); setCheckoutLoading(null) }
        } catch (error) { toast.error(error.message); setCheckoutLoading(null) }
    }

    const handleStartTrial = async (offer) => {
        setTrialLoading(offer.id)
        try {
            const res = await fetch(`/api/backend/partner/offers/${offer.id}/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: session?.user?.email, isTrial: true })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao iniciar teste grátis')
            toast.success('Modo teste ativado!')
            fetchData()
        } catch (error) { toast.error(error.message) }
        finally { setTrialLoading(null) }
    }

    const handleCancelSubscription = async () => {
        if (!cancelingSub) return
        setIsCanceling(true)
        try {
            const res = await fetch(`/api/backend/user/subscriptions/${cancelingSub.id}`, { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || 'Erro ao cancelar.')
            toast.success(data.message || 'Assinatura cancelada.')
            setCancelingSub(null)
            fetchData()
        } catch (error) { toast.error(error.message) }
        finally { setIsCanceling(false) }
    }

    const handleReactivate = async (sub) => {
        setReactivating(sub.id)
        try {
            const res = await fetch(`/api/backend/user/subscriptions/${sub.id}`, { method: 'PATCH' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || 'Erro ao reativar.')
            toast.success(data.message || 'Assinatura reativada!')
            fetchData()
        } catch (error) { toast.error(error.message) }
        finally { setReactivating(null) }
    }

    // Opção B — confirmar troca de plano
    const handleSwitchPlan = async () => {
        if (!switchDialog) return
        const { sub, targetOffer } = switchDialog
        setIsSwitching(true)
        try {
            const res = await fetch(`/api/backend/user/subscriptions/${sub.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ switchToOfferId: targetOffer.id }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao trocar plano.')
            setSwitchDialog(null)
            if (data.requiresNewCheckout) {
                toast.success(data.message)
                await handleSubscribe(targetOffer)
            } else {
                toast.success(data.message)
                fetchData()
            }
        } catch (error) { toast.error(error.message) }
        finally { setIsSwitching(false) }
    }

    // Cancela um downgrade agendado — reutiliza o PATCH de reativação
    // que já limpa pendingOfferId + status='active' + Stripe cancel_at_period_end=false
    const handleCancelDowngrade = async (sub) => {
        setReactivating(sub.id)
        try {
            const res = await fetch(`/api/backend/user/subscriptions/${sub.id}`, { method: 'PATCH' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || 'Erro ao cancelar downgrade.')
            toast.success('Downgrade cancelado. Seu plano atual foi mantido!')
            fetchData()
        } catch (error) { toast.error(error.message) }
        finally { setReactivating(null) }
    }

    if (checkoutSecret) {
        return (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto p-4 pt-8">
                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl">
                    <div className="flex items-center justify-between px-6 py-4 border-b">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Assinar Plano</h2>
                            <p className="text-sm text-gray-500">Pagamento seguro via Stripe</p>
                        </div>
                        <button onClick={() => { setCheckoutSecret(null); setCheckoutOfferId(null) }}
                            className="rounded-full p-2 hover:bg-gray-100 transition-colors" aria-label="Fechar">
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

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        )
    }

    const availableOffers = []
    trainers.forEach(studentRecord => {
        studentRecord.trainer?.partnerAccount?.offers?.forEach(offer => {
            availableOffers.push({
                ...offer,
                trainerName: studentRecord.trainer.name,
                trainerImage: studentRecord.trainer.image,
                trainerId: studentRecord.trainer.id,
                partnerAccountId: studentRecord.trainer.partnerAccount?.id,
                allowTestMode: studentRecord.trainer.partnerAccount?.allowTestMode
            })
        })
    })

    const activeOfferIds  = subscriptions.map(sub => sub.offerId)
    // Para cada oferta, verificar se já há assinatura ativa com o mesmo treinador
    const activeSubByPartnerId = {}
    subscriptions.forEach(sub => {
        const partnerId = sub.offer?.partner?.id
        if (partnerId && !activeSubByPartnerId[partnerId]) {
            activeSubByPartnerId[partnerId] = sub
        }
    })

    // Separar ofertas em: novas (sem sub com o treinador) e "trocar plano" (mesmo treinador, oferta diferente)
    const newOffers    = availableOffers.filter(o => !activeOfferIds.includes(o.id) && !activeSubByPartnerId[o.partnerAccountId])
    const switchOffers = availableOffers.filter(o => !activeOfferIds.includes(o.id) && !!activeSubByPartnerId[o.partnerAccountId])

    // Não mostrar "Trocar Plano" se a sub do treinador já tem um downgrade agendado
    const switchOffersFiltered = switchOffers.filter(o => {
        const currentSub = activeSubByPartnerId[o.partnerAccountId]
        return !(currentSub?.status === 'canceling' && currentSub?.pendingOfferId)
    })

    const activeOnly   = subscriptions.filter(s => s.status === 'active' || s.status === 'canceling' || s.status === 'trialing')
    // Opção A: usar priceAtSubscription se disponível (isola reajustes futuros do treinador)
    const totalMonthly = activeOnly.reduce((acc, sub) => {
        const displayPrice = sub.priceAtSubscription ?? ((sub.offer?.price || 0) + (sub.offer?.hourlyRate || 0))
        return acc + displayPrice
    }, 0)

    return (
        <div className="max-w-5xl mx-auto space-y-8">

            {/* ── Hero banner ─────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-green-950 to-emerald-900 p-8 text-white shadow-xl">
                {/* fundo decorativo */}
                <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-green-400/10 blur-3xl" />
                <div className="absolute bottom-0 left-10 w-40 h-40 rounded-full bg-emerald-500/10 blur-2xl" />

                <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                    <div>
                        <p className="text-green-400 text-sm font-semibold tracking-widest uppercase mb-1">Player.Action</p>
                        <h1 className="text-3xl font-black">Minhas Assinaturas</h1>
                        <p className="text-white/60 mt-1 text-sm">Gerencie seus planos com seu treinador.</p>
                    </div>

                    {subscriptions.length > 0 && (
                        <div className="flex gap-4">
                            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-5 py-3 text-center border border-white/10">
                                <p className="text-white/60 text-xs mb-1">Planos ativos</p>
                                <p className="text-2xl font-black text-green-400">{activeOnly.length}</p>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-5 py-3 text-center border border-white/10">
                                <p className="text-white/60 text-xs mb-1">Total/mês</p>
                                <p className="text-2xl font-black text-white">R$ {totalMonthly.toFixed(2)}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Planos Ativos ────────────────────────────────────────── */}
            <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-green-600" /> Planos Ativos
                </h2>

                {subscriptions.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                            <CreditCard className="w-7 h-7 text-gray-300" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-700">Nenhuma assinatura ativa</h3>
                        <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
                            Veja os planos disponíveis abaixo e assine o de seu treinador.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {subscriptions.map(sub => {
                            // Opção A: exibe o preço no momento da assinatura (grandfathering)
                            const offerCurrentPrice = (sub.offer?.price || 0) + (sub.offer?.hourlyRate || 0)
                            const displayPrice      = sub.priceAtSubscription ?? offerCurrentPrice
                            const isGrandfathered   = sub.priceAtSubscription != null && sub.priceAtSubscription !== offerCurrentPrice
                            const total             = displayPrice.toFixed(2)
                            const trainerName = sub.offer?.partner?.user?.name
                            const trainerImg  = sub.offer?.partner?.user?.image
                            const since       = new Date(sub.createdAt).toLocaleDateString('pt-BR')
                            const isDowngrade = sub.status === 'canceling' && !!sub.pendingOfferId
                            return (
                                <div key={sub.id} className="group rounded-2xl overflow-hidden shadow-sm border border-gray-100 bg-white hover:shadow-lg transition-shadow">
                                    <div className="bg-gradient-to-r from-green-500 to-emerald-500 h-2" />
                                    <div className="p-5">
                                        {/* status + price */}
                                        <div className="flex items-center justify-between mb-4">
                                            {sub.status === 'canceling' ? (
                                                isDowngrade ? (
                                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
                                                        <RefreshCw className="w-3 h-3" /> Downgrade agendado
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                                                        <Clock className="w-3 h-3" /> Cancelamento agendado
                                                    </span>
                                                )
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                    Ativo
                                                </span>
                                            )}
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-2xl font-black text-gray-900">
                                                    R$ {total}<span className="text-sm font-normal text-gray-400">/mês</span>
                                                </span>
                                                {isGrandfathered && (
                                                    <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                                                        🔒 Preço garantido
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <h3 className="text-lg font-bold text-gray-900 mb-4">{sub.offer?.name}</h3>

                                        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 mb-4">
                                            <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                                                <AvatarImage src={trainerImg} />
                                                <AvatarFallback className="bg-emerald-100 text-emerald-700 font-bold text-sm">
                                                    {trainerName?.[0] || 'T'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Treinador</p>
                                                <p className="text-sm font-semibold text-gray-800">{trainerName}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-gray-500 mb-5">
                                            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Desde {since}</span>
                                        </div>

                                        {sub.status === 'canceling' ? (
                                            isDowngrade ? (
                                                <button
                                                    onClick={() => handleCancelDowngrade(sub)}
                                                    disabled={reactivating === sub.id}
                                                    className="w-full text-sm text-blue-600 border border-blue-200 rounded-xl py-2.5 hover:bg-blue-50 hover:border-blue-300 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                                                >
                                                    {reactivating === sub.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                    Cancelar Downgrade
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleReactivate(sub)}
                                                    disabled={reactivating === sub.id}
                                                    className="w-full text-sm text-green-600 border border-green-200 rounded-xl py-2.5 hover:bg-green-50 hover:border-green-300 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                                                >
                                                    {reactivating === sub.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                    Desistir do Cancelamento
                                                </button>
                                            )
                                        ) : (
                                            <button
                                                onClick={() => setCancelingSub(sub)}
                                                className="w-full text-sm text-red-500 border border-red-100 rounded-xl py-2.5 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors font-medium flex items-center justify-center gap-2"
                                            >
                                                <XCircle className="w-4 h-4" /> Cancelar Assinatura
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>

            {/* ── Planos para trocar (mesmo treinador) ──────────────────────────── */}
            {switchOffersFiltered.length > 0 && (
                <section>
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <RefreshCw className="w-5 h-5 text-purple-600" /> Trocar de Plano
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {switchOffersFiltered.map(offer => {
                            const currentSub   = activeSubByPartnerId[offer.partnerAccountId]
                            const currentPrice = (currentSub?.offer?.price || 0) + (currentSub?.offer?.hourlyRate || 0)
                            const targetPrice  = (offer.price || 0) + (offer.hourlyRate || 0)
                            const isUpgrade    = targetPrice >= currentPrice
                            return (
                                <div key={offer.id} className="rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage src={offer.trainerImage} />
                                            <AvatarFallback className="bg-purple-50 text-purple-700 font-bold text-sm">{offer.trainerName?.[0]}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Treinador</p>
                                            <p className="text-sm font-semibold text-gray-800">{offer.trainerName}</p>
                                        </div>
                                        <span className={`ml-auto text-xs font-bold px-2 py-1 rounded-full ${
                                            isUpgrade ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                        }`}>
                                            {isUpgrade ? '↑ Upgrade' : '↓ Downgrade'}
                                        </span>
                                    </div>
                                    <h3 className="text-base font-bold text-gray-900 mb-1">{offer.name}</h3>
                                    {offer.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{offer.description}</p>}
                                    <div className="flex items-center justify-between">
                                        <span className="text-xl font-black text-gray-900">
                                            R$ {targetPrice.toFixed(2)}<span className="text-sm font-normal text-gray-400">/mês</span>
                                        </span>
                                        <button
                                            onClick={() => setSwitchDialog({ sub: currentSub, targetOffer: offer, isUpgrade })}
                                            disabled={checkoutLoading === offer.id}
                                            className={`text-sm px-4 py-2 rounded-xl font-medium flex items-center gap-1.5 disabled:opacity-60 ${
                                                isUpgrade
                                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                                    : 'bg-orange-500 text-white hover:bg-orange-600'
                                            }`}
                                        >
                                            <RefreshCw className="w-4 h-4" /> Trocar Plano
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* ── Outros Planos ────────────────────────────────────────── */}
            {newOffers.length > 0 && (
                <section>
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-600" /> Outros Planos Disponíveis
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {newOffers.map(offer => (
                            <div key={offer.id} className="rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={offer.trainerImage} />
                                        <AvatarFallback className="bg-blue-50 text-blue-700 font-bold">{offer.trainerName?.[0]}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Treinador Parceiro</p>
                                        <p className="text-sm font-semibold text-gray-800">{offer.trainerName}</p>
                                    </div>
                                </div>
                                <h3 className="text-lg font-bold text-gray-900">{offer.name}</h3>
                                {offer.description && <p className="text-sm text-gray-500 mt-1 mb-4 line-clamp-2">{offer.description}</p>}
                                <div className="flex items-center justify-between">
                                    <span className="text-2xl font-black text-gray-900">
                                        R$ {((offer.price || 0) + (offer.hourlyRate || 0)).toFixed(2)}
                                        <span className="text-sm font-normal text-gray-400">/mês</span>
                                    </span>
                                    <div className="flex gap-2">
                                        {systemSettings?.enableB2BTestMode && offer.allowTestMode && (
                                            <button onClick={() => handleStartTrial(offer)} disabled={trialLoading === offer.id}
                                                className="text-sm px-4 py-2 rounded-xl border border-orange-200 text-orange-600 hover:bg-orange-50 font-medium flex items-center gap-1.5 disabled:opacity-60">
                                                {trialLoading === offer.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Gift className="w-4 h-4" /> Grátis</>}
                                            </button>
                                        )}
                                        <button onClick={() => handleSubscribe(offer)} disabled={checkoutLoading === offer.id}
                                            className="text-sm px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 font-medium flex items-center gap-1.5 disabled:opacity-60">
                                            {checkoutLoading === offer.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CreditCard className="w-4 h-4" /> Assinar</>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Dialog Cancelar ──────────────────────────────────────── */}
            <Dialog open={!!cancelingSub} onOpenChange={(open) => { if (!open) setCancelingSub(null) }}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-700">
                            <XCircle className="w-5 h-5" /> Cancelar Assinatura
                        </DialogTitle>
                        <DialogDescription className="space-y-3 pt-1">
                            <p>Tem certeza que deseja cancelar <strong>"{cancelingSub?.offer?.name}"</strong>?</p>
                            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-800 text-sm flex gap-2">
                                <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>Seu acesso continua até o fim do período já pago. Após isso, os planos de treino serão ocultados.</span>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelingSub(null)}>Manter</Button>
                        <Button variant="destructive" disabled={isCanceling} onClick={handleCancelSubscription}>
                            {isCanceling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Confirmar Cancelamento
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Dialog Trocar Plano ───────────────────────────── */}
            <Dialog open={!!switchDialog} onOpenChange={(open) => { if (!open) setSwitchDialog(null) }}>
                <DialogContent className="sm:max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RefreshCw className="w-5 h-5" />
                            {switchDialog?.isUpgrade ? 'Confirmar Upgrade' : 'Confirmar Downgrade'}
                        </DialogTitle>
                        <DialogDescription className="space-y-3 pt-2">
                            <p>
                                Você está trocando <strong>"{switchDialog?.sub?.offer?.name}"</strong> por{' '}
                                <strong>"{switchDialog?.targetOffer?.name}"</strong>.
                            </p>
                            {switchDialog?.isUpgrade ? (
                                <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-green-800 text-sm flex gap-2">
                                    <Zap className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>Seu plano atual será cancelado imediatamente e você será redirecionado para o checkout do novo plano.</span>
                                </div>
                            ) : (
                                <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-orange-800 text-sm flex gap-2">
                                    <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>Seu plano atual continua ativo até o fim do período já pago. Você receberá uma notificação quando puder ativar o novo plano.</span>
                                </div>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSwitchDialog(null)}>Cancelar</Button>
                        <Button
                            disabled={isSwitching}
                            className={switchDialog?.isUpgrade ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-500 hover:bg-orange-600'}
                            onClick={handleSwitchPlan}
                        >
                            {isSwitching && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {switchDialog?.isUpgrade ? 'Fazer Upgrade' : 'Confirmar Downgrade'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
