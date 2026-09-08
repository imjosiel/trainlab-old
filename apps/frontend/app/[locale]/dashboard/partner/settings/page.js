'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadConnectAndInitialize } from '@stripe/connect-js'
import { ConnectComponentsProvider, ConnectAccountManagement } from '@stripe/react-connect-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, RefreshCw, Settings, ToggleLeft, ToggleRight, Gift } from 'lucide-react'
import { toast } from 'sonner'

export default function PartnerSettingsPage() {
    const [stripeConnectInstance, setStripeConnectInstance] = useState(null)
    const [partnerSettings, setPartnerSettings] = useState(null)
    const [systemSettings, setSystemSettings] = useState(null)
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState(null)
    const router = useRouter()

    useEffect(() => {
        let isMounted = true

        const initializeSettings = async () => {
            try {
                // Fetch Partner-specific settings and System flags
                const settingsRes = await fetch('/api/backend/partner/settings')
                if (settingsRes.ok) {
                    const data = await settingsRes.json()
                    if (isMounted) {
                        setPartnerSettings(data.partnerAccount)
                        setSystemSettings(data.systemSettings)
                    }
                }

                // Fetch Stripe Session...
                const sessionRes = await fetch('/api/backend/partner/connect/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ components: ['account_management'] })
                })

                if (!sessionRes.ok) {
                    const data = await sessionRes.json()
                    // If the account isn't set up yet, they shouldn't be here
                    if (sessionRes.status === 400 && data.error?.includes('Complete o setup')) {
                        router.push('/dashboard/partner/onboarding')
                        return
                    }
                    throw new Error(data.error || 'Falha ao iniciar sessão de configurações.')
                }

                const { clientSecret } = await sessionRes.json()

                if (!clientSecret) {
                    throw new Error('Client secret não recebido')
                }

                // Initialize the Stripe Connect JS library
                const fetchClientSecret = () => Promise.resolve(clientSecret)

                const stripeConnect = await loadConnectAndInitialize({
                    publishableKey: process.env.NEXT_PUBLIC_STRIPE_KEY,
                    fetchClientSecret,
                    appearance: {
                        variables: {
                            colorPrimary: '#16a34a', // green-600
                        }
                    }
                })

                if (isMounted) {
                    setStripeConnectInstance(stripeConnect)
                    setLoading(false)
                }

            } catch (err) {
                console.error('Settings Error:', err)
                if (isMounted) {
                    setError(err.message)
                    setLoading(false)
                }
            }
        }

        initializeSettings()

        return () => {
            isMounted = false
        }
    }, [router])

    const handleToggleTestMode = async () => {
        const newValue = !partnerSettings.allowTestMode
        setIsSaving(true)
        try {
            const res = await fetch('/api/backend/partner/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allowTestMode: newValue })
            })
            if (res.ok) {
                setPartnerSettings(prev => ({ ...prev, allowTestMode: newValue }))
                toast.success(newValue ? 'Modo teste ativado!' : 'Modo teste desativado.')
            } else {
                toast.error('Erro ao salvar preferência.')
            }
        } catch (error) {
            toast.error('Erro de conexão.')
        } finally {
            setIsSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col h-[50vh] items-center justify-center space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-green-600" />
                <p className="text-gray-500 font-medium">Carregando painel de gestão...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="max-w-xl mx-auto mt-12">
                <Card className="border-red-200 bg-red-50">
                    <CardHeader>
                        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                        <CardTitle className="text-red-700">Acesso Restrito</CardTitle>
                        <CardDescription className="text-red-600/80">
                            Não foi possível carregar as configurações de conta bancária.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-red-800 mb-6 bg-red-100 p-3 rounded">{error}</p>
                        <div className="flex gap-4">
                            <Button
                                onClick={() => window.location.reload()}
                                variant="outline"
                                className="bg-white border-red-200 hover:bg-red-50"
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Tentar Novamente
                            </Button>
                            <Button onClick={() => router.push('/dashboard/partner/apply')} variant="default">
                                Voltar ao Início
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div className="mb-8 flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <Settings className="w-6 h-6 text-gray-700" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Configurações Financeiras</h1>
                    <p className="text-gray-500 mt-1">
                        Gerencie seus dados bancários, documentos fiscais e revise suas informações junto ao provedor de pagamentos.
                    </p>
                </div>
            </div>

            {/* Configurações de Sandbox / Modo Teste (Se habilitado pelo Admin) */}
            {systemSettings?.enableB2BTestMode && (
                <Card className="border-orange-200 bg-orange-50/30 overflow-hidden mb-8">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Gift className="w-5 h-5 text-orange-600" />
                                <div>
                                    <CardTitle className="text-lg text-orange-900">Período de Experiência (SandBox)</CardTitle>
                                    <CardDescription className="text-orange-700/70">
                                        Ofereça 30 dias de acesso gratuito para seus alunos testarem a plataforma.
                                    </CardDescription>
                                </div>
                            </div>
                            <button 
                                onClick={handleToggleTestMode}
                                disabled={isSaving}
                                className="focus:outline-none disabled:opacity-50"
                            >
                                {partnerSettings?.allowTestMode ? (
                                    <ToggleRight className="w-12 h-12 text-orange-600" />
                                ) : (
                                    <ToggleLeft className="w-12 h-12 text-orange-300" />
                                )}
                            </button>
                        </div>
                    </CardHeader>
                </Card>
            )}

            <Card className="shadow-sm border border-gray-200 overflow-hidden">
                <CardContent className="p-2 sm:p-4 md:p-6 h-[80vh] min-h-[600px] overflow-y-auto bg-gray-50/50">
                    {stripeConnectInstance ? (
                        <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
                            <ConnectAccountManagement />
                        </ConnectComponentsProvider>
                    ) : (
                        <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-10 space-y-4">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                                <Settings className="w-8 h-8 text-gray-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-700">Conta bancária não configurada</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Configure sua conta de recebimentos para começar a vender planos de treinamento.
                                </p>
                            </div>
                            <Button onClick={() => router.push('/dashboard/partner/onboarding')} className="bg-green-600 hover:bg-green-700">
                                Configurar conta de pagamentos
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
