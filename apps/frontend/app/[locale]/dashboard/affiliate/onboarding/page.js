'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadConnectAndInitialize } from '@stripe/connect-js'
import { ConnectComponentsProvider, ConnectAccountOnboarding } from '@stripe/react-connect-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, RefreshCw, Clock, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

export default function AffiliateOnboardingPage() {
    const [stripeConnectInstance, setStripeConnectInstance] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [onboardingIncomplete, setOnboardingIncomplete] = useState(false)
    const [isRestricted, setIsRestricted] = useState(false)
    const router = useRouter()

    useEffect(() => {
        let isMounted = true

        const timeoutId = setTimeout(() => {
            if (isMounted) {
                setError('Tempo limite atingido ao carregar o formulário do Stripe. Tente novamente.')
                setLoading(false)
            }
        }, 15000)

        const initializeEmbeddedComponents = async () => {
            try {
                const publishableKey = process.env.NEXT_PUBLIC_STRIPE_KEY
                if (!publishableKey) {
                    throw new Error('Chave pública do Stripe não configurada (NEXT_PUBLIC_STRIPE_KEY). Contate o suporte.')
                }

                // 1. Setup the Stripe Account (if missing)
                const setupRes = await fetch('/api/backend/affiliate/connect/setup', { method: 'POST' })
                if (!setupRes.ok) {
                    const data = await setupRes.json()
                    throw new Error(data.error || 'Falha ao configurar conta de afiliado.')
                }

                // 2. Fetch the client secret for the Connect Session
                const sessionRes = await fetch('/api/backend/affiliate/connect/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ components: ['account_onboarding'] })
                })

                if (!sessionRes.ok) {
                    const data = await sessionRes.json()
                    throw new Error(data.error || 'Falha ao iniciar sessão de onboarding.')
                }

                const { clientSecret } = await sessionRes.json()

                if (!clientSecret) {
                    throw new Error('Client secret não recebido do Stripe.')
                }

                // 3. Initialize the Stripe Connect JS library
                const stripeConnect = await loadConnectAndInitialize({
                    publishableKey,
                    fetchClientSecret: () => Promise.resolve(clientSecret),
                    appearance: {
                        variables: {
                            colorPrimary: '#ec4899',
                            borderRadius: '8px',
                            colorBackground: '#ffffff',
                            colorText: '#1f2937',
                        }
                    }
                })

                clearTimeout(timeoutId)

                if (isMounted) {
                    setStripeConnectInstance(stripeConnect)
                    setLoading(false)
                }

            } catch (err) {
                clearTimeout(timeoutId)
                console.error('[AffiliateOnboarding]', err)
                if (isMounted) {
                    setError(err.message)
                    setLoading(false)
                }
            }
        }

        initializeEmbeddedComponents()

        return () => {
            isMounted = false
            clearTimeout(timeoutId)
        }
    }, [])

    const handleExit = async () => {
        try {
            const syncRes = await fetch('/api/backend/affiliate/connect/sync', { method: 'POST' })
            const syncData = await syncRes.json()
            
            if (syncData.payoutsEnabled) {
                toast.success('Configuração bancária concluída com sucesso! ✅')
                router.push('/dashboard/affiliate')
                return
            }

            if (syncData.stripeAccountStatus === 'restricted' || syncData.stripeAccountStatus === 'pending') {
                setIsRestricted(true)
                setOnboardingIncomplete(true)
                setStripeConnectInstance(null)
                toast.info('Sua conta está em análise pelo Stripe.')
            } else {
                setOnboardingIncomplete(true)
                setStripeConnectInstance(null)
                toast.info('Complete as etapas pendentes para ativar os recebimentos.')
            }
        } catch {
            toast.error('Erro ao verificar status. Tente novamente.')
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col h-[50vh] items-center justify-center space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-pink-500" />
                <p className="text-gray-500 font-medium animate-pulse">
                    Preparando um ambiente bancário seguro...
                </p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="max-w-xl mx-auto mt-12">
                <Card className="border-red-200 bg-red-50">
                    <CardHeader>
                        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                        <CardTitle className="text-red-700">Erro na Configuração</CardTitle>
                        <CardDescription className="text-red-600/80">
                            Não foi possível carregar os componentes de onboarding.
                        </CardDescription>
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

    if (onboardingIncomplete) {
        return (
            <div className="max-w-xl mx-auto mt-12">
                <Card className={isRestricted ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}>
                    <CardHeader>
                        <div className={`mx-auto w-12 h-12 ${isRestricted ? 'bg-green-100' : 'bg-amber-100'} rounded-full flex items-center justify-center mb-4`}>
                            {isRestricted ? <CheckCircle2 className="w-6 h-6 text-green-600" /> : <Clock className="w-6 h-6 text-amber-600" />}
                        </div>
                        <CardTitle className={`${isRestricted ? 'text-green-900' : 'text-amber-900'} text-center`}>
                            {isRestricted ? 'Dados em Análise' : 'Configuração Incompleta'}
                        </CardTitle>
                        <CardDescription className={`text-center ${isRestricted ? 'text-green-700/80' : 'text-amber-700/80'}`}>
                            {isRestricted 
                                ? 'O Stripe recebeu seus dados e está processando a verificação. Isso pode levar alguns minutos ou horas.'
                                : 'Você ainda tem etapas pendentes no Stripe. Complete a verificação para começar a receber suas comissões.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className={`text-sm ${isRestricted ? 'text-green-800 bg-green-100/50' : 'text-amber-800 bg-amber-100/50'} p-4 rounded-lg`}>
                        {isRestricted 
                            ? <p>Você já pode acessar o dashboard e compartilhar seu link de indicação, mas as comissões só serão transferidas após a aprovação final do Stripe.</p>
                            : <p>O Stripe requer que você informe seus dados pessoais, bancários e de identidade antes de ativar os recebimentos. Você pode continuar de onde parou a qualquer momento.</p>}
                    </CardContent>
                    <CardFooter className="flex flex-col sm:flex-row gap-3 pt-4">
                        {!isRestricted && (
                            <Button
                                className="w-full bg-amber-600 hover:bg-amber-700"
                                onClick={() => {
                                    setOnboardingIncomplete(false)
                                    setLoading(true)
                                    window.location.reload()
                                }}
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Continuar Configuração
                            </Button>
                        )}
                        <Button
                            variant={isRestricted ? "default" : "outline"}
                            className={`w-full ${isRestricted ? 'bg-green-600 hover:bg-green-700' : 'border-amber-300'}`}
                            onClick={() => router.push('/dashboard/affiliate')}
                        >
                            Ir para o Dashboard
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Configuração de Pagamentos</h1>
                <p className="text-gray-500 mt-2">
                    Para que você possa receber suas comissões de indicação automaticamente, precisamos verificar sua identidade e configurar sua conta bancária.
                </p>
            </div>

            <Card className="shadow-xl border border-gray-200 overflow-hidden rounded-2xl">
                <CardContent className="p-2 sm:p-6 min-h-[600px] bg-white">
                    {stripeConnectInstance && (
                        <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
                            <ConnectAccountOnboarding
                                onExit={handleExit}
                                onLoadError={(err) => {
                                    console.error('[ConnectAccountOnboarding] Load error:', err)
                                    setError(
                                        err?.error?.message ||
                                        'Erro ao carregar o formulário bancário do Stripe. Verifique se o modo de teste está ativo ou tente novamente.'
                                    )
                                }}
                            />
                        </ConnectComponentsProvider>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
