'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadConnectAndInitialize } from '@stripe/connect-js'
import { ConnectComponentsProvider, ConnectPayments, ConnectPayouts } from '@stripe/react-connect-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, RefreshCw, TrendingUp, Users, DollarSign, Wallet, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export default function PartnerRevenuePage() {
    const [stripeConnectInstance, setStripeConnectInstance] = useState(null)
    const [metrics, setMetrics] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const router = useRouter()

    useEffect(() => {
        let isMounted = true

        const fetchMetricsAndInitializeStripe = async () => {
            try {
                // 1. Load Local Metrics
                const metricsRes = await fetch('/api/backend/partner/metrics')
                if (!metricsRes.ok) {
                    const data = await metricsRes.json()
                    throw new Error(data.error || 'Falha ao carregar métricas locais.')
                }
                const metricsData = await metricsRes.json()
                if (isMounted) setMetrics(metricsData)

                // 2. Fetch the client secret for Payments/Payouts components
                const sessionRes = await fetch('/api/backend/partner/connect/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ components: ['payments', 'payouts'] })
                })

                if (!sessionRes.ok) {
                    const data = await sessionRes.json()
                    if (sessionRes.status === 400 && data.error?.includes('Complete o setup')) {
                        router.push('/dashboard/partner/onboarding')
                        return
                    }
                    throw new Error(data.error || 'Falha ao carregar sessão financeira segura.')
                }

                const { clientSecret } = await sessionRes.json()
                if (!clientSecret) throw new Error('Client secret não recebido')

                // 3. Initialize Stripe Connect JS
                const fetchClientSecret = () => Promise.resolve(clientSecret)
                const stripeConnect = await loadConnectAndInitialize({
                    publishableKey: process.env.NEXT_PUBLIC_STRIPE_KEY,
                    fetchClientSecret,
                    // Stripe Connect Embedded Components exigem hex literal
                    // na propriedade `appearance.variables` — NÃO substituir por Tailwind.
                    // Ref: https://docs.stripe.com/connect/get-started-connect-embedded-components#customize-the-look-of-connect-embedded-components
                    appearance: {
                        variables: {
                            colorPrimary: '#16a34a',   // tw green-600
                            borderRadius: '8px',
                            colorBackground: '#ffffff',
                            colorText: '#1f2937',      // tw gray-800
                        }
                    }
                })

                if (isMounted) {
                    setStripeConnectInstance(stripeConnect)
                    setLoading(false)
                }

            } catch (err) {
                console.error('Revenue Dashboard Error:', err)
                if (isMounted) {
                    setError(err.message)
                    setLoading(false)
                }
            }
        }

        fetchMetricsAndInitializeStripe()

        return () => { isMounted = false }
    }, [router])

    if (loading) {
        return (
            <div className="flex flex-col h-[50vh] items-center justify-center space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-green-600" />
                <p className="text-gray-500 font-medium">Sincronizando com a instituição bancária...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="max-w-xl mx-auto mt-12">
                <Card className="border-red-200 bg-red-50">
                    <CardHeader>
                        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                        <CardTitle className="text-red-700">Erro ao Carregar Financeiro</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-red-800 mb-6 bg-red-100 p-3 rounded">{error}</p>
                        <Button
                            onClick={() => window.location.reload()}
                            variant="outline"
                            className="bg-white border-red-200 hover:bg-red-50"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Tentar Novamente
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-12">
            <div className="mb-8 flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-green-700" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard de Vendas</h1>
                    <p className="text-gray-500 mt-1">
                        Acompanhe seus lucros mensais, recebimentos confirmados e próximos depósitos bancários.
                    </p>
                </div>
            </div>

            {/* Banner de KYC Pendente */}
            {metrics && (!metrics.payoutsEnabled || !metrics.chargesEnabled) && (
                <div className="flex items-start gap-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                        <p className="font-semibold text-amber-900">Conta bancária pendente de configuração</p>
                        <p className="text-sm text-amber-700 mt-1">
                            {!metrics.stripeAccountId
                                ? 'Você ainda não criou sua conta no Stripe. Conclua o processo para começar a receber pagamentos dos seus alunos.'
                                : 'Você iniciou mas não concluiu o processo de verificação de identidade no Stripe. Complete-o para habilitar os recebimentos.'}
                        </p>
                    </div>
                    <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
                        onClick={() => router.push('/dashboard/partner/onboarding')}
                    >
                        {!metrics.stripeAccountId ? 'Configurar conta' : 'Concluir verificação'}
                    </Button>
                </div>
            )}

            {/* Top Metrics Cards */}
            {metrics && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="shadow-sm border-gray-200">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500 flex items-center justify-between">
                                MRR (Sua Parte)
                                <DollarSign className="w-4 h-4 text-green-500" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                                {formatCurrency(metrics.netMrr)}
                            </div>
                            <p className="text-xs text-green-600 mt-1 font-medium">
                                Receita recorrente garantida
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-gray-200">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500 flex items-center justify-between">
                                Transacionado Total
                                <TrendingUp className="w-4 h-4 text-blue-500" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                                {formatCurrency(metrics.grossMrr)}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Pago pelos alunos
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-gray-200">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500 flex items-center justify-between">
                                Alunos Ativos
                                <Users className="w-4 h-4 text-purple-500" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                                {metrics.activeStudentsCount}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Assinaturas ativas nos seus planos
                            </p>
                        </CardContent>
                    </Card>

                    {/* Design intencional: card premium escuro para destacar o tier do parceiro
                        e criar hierarquia visual em relação aos demais cards brancos. */}
                    <Card className="bg-slate-900 border-0 text-white shadow-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-slate-300 flex items-center justify-between">
                                Plano de Parceiro
                                <Wallet className="w-4 h-4 text-amber-400" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold uppercase tracking-wider text-amber-400">
                                {metrics.tier}
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                                Taxa da plataforma: {(metrics.commissionRate * 100).toFixed(0)}%
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Embedded Stripe Components */}
            <div className="grid lg:grid-cols-2 gap-8">
                {stripeConnectInstance && (
                    <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
                        <div className="space-y-4">
                            <h2 className="text-xl font-bold text-gray-900 px-1">Repasses (Payouts)</h2>
                            <Card className="shadow-lg border border-gray-100 overflow-hidden rounded-2xl">
                                <CardContent className="p-2 sm:p-4 min-h-[500px] bg-white">
                                    {/* Exibe o cronograma de saques para a conta bancária do Treinador */}
                                    <ConnectPayouts />
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-xl font-bold text-gray-900 px-1">Histórico de Cobranças</h2>
                            <Card className="shadow-lg border border-gray-100 overflow-hidden rounded-2xl">
                                <CardContent className="p-2 sm:p-4 min-h-[500px] bg-white">
                                    {/* Exibe cada pagamento individual feito pelos alunos daquele treinador */}
                                    <ConnectPayments />
                                </CardContent>
                            </Card>
                        </div>
                    </ConnectComponentsProvider>
                )}
            </div>
        </div>
    )
}
