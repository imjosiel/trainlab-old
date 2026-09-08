'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, Trophy, Star, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

export default function PartnerInvitePage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const router = useRouter()
    const { data: session, status: sessionStatus } = useSession()

    const [offer, setOffer] = useState(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [email, setEmail] = useState('')
    const [name, setName] = useState('')

    const offerId = params.offerId
    const isSuccess = searchParams.get('success') === 'true'
    const isCanceled = searchParams.get('canceled') === 'true'

    useEffect(() => {
        const fetchOfferInfo = async () => {
            try {
                // Fetch public offer details (we can create a quick GET endpoint for public offers if needed, 
                // but for now we'll assume we have a public endpoint or we can use a server action. 
                // Let's create a public GET route next).
                const res = await fetch(`/api/backend/partner/offers/public/${offerId}`)
                if (res.ok) {
                    const data = await res.json()
                    setOffer(data.offer)
                } else {
                    toast.error('Oferta não encontrada ou inativa.')
                    setOffer(null)
                }
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }

        if (offerId) fetchOfferInfo()
    }, [offerId])

    useEffect(() => {
        if (session?.user) {
            setEmail(session.user.email || '')
            setName(session.user.name || '')
        }
    }, [session])

    useEffect(() => {
        if (isSuccess) {
            toast.success('Assinatura confirmada com sucesso! Bem-vindo(a)!')
            // Redirect to dashboard after 3s
            setTimeout(() => {
                router.push('/dashboard')
            }, 3000)
        }
        if (isCanceled) {
            toast.error('Ação cancelada. Você não foi cobrado.')
        }
    }, [isSuccess, isCanceled, router])

    const handleCheckout = async (e) => {
        e.preventDefault()
        if (!email) {
            toast.error('Informe seu email para continuar.')
            return
        }

        setSubmitting(true)
        try {
            const res = await fetch('/api/backend/stripe/checkout-b2b', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    offerId,
                    email,
                    name,
                    returnUrl: window.location.href.split('?')[0] // current url without query params
                })
            })

            const data = await res.json()

            if (res.ok && data.checkoutUrl) {
                window.location.href = data.checkoutUrl
            } else {
                toast.error(data.error || 'Erro ao iniciar pagamento.')
                setSubmitting(false)
            }
        } catch (error) {
            toast.error('Erro de conexão ao processar checkout.')
            setSubmitting(false)
        }
    }

    if (loading || sessionStatus === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <Loader2 className="w-10 h-10 animate-spin text-green-600" />
            </div>
        )
    }

    if (!offer) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
                <Card className="max-w-md w-full text-center">
                    <CardHeader>
                        <CardTitle className="text-xl">Oferta Indisponível</CardTitle>
                        <CardDescription>
                            Este link de convite é inválido ou a oferta não está mais ativa.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter className="justify-center">
                        <Button variant="outline" onClick={() => router.push('/')}>Voltar ao Início</Button>
                    </CardFooter>
                </Card>
            </div>
        )
    }

    if (isSuccess) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
                <div className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                        <CheckCircle2 className="w-10 h-10" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900">Pagamento Confirmado!</h1>
                    <p className="text-gray-500">Estamos preparando sua conta. Você será redirecionado em instantes...</p>
                    <Loader2 className="w-6 h-6 animate-spin text-green-600 mx-auto mt-4" />
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col pt-12 pb-24 px-4 sm:px-6">

            <div className="flex justify-center mb-8">
                <div className="flex items-center">
                    <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center shadow-md">
                        <Trophy className="w-6 h-6 text-white" />
                    </div>
                    <span className="ml-3 text-2xl font-bold text-gray-900 tracking-tight">Player.Action</span>
                </div>
            </div>

            <main className="max-w-4xl mx-auto w-full grid md:grid-cols-5 gap-8">
                {/* Left column: Offer Details */}
                <div className="md:col-span-3 space-y-6">
                    <div>
                        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 mb-4">
                            <Star className="w-3 h-3 mr-1" /> Treinador Parceiro Certificado
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                            {offer.name}
                        </h1>
                        <p className="mt-2 text-xl text-gray-500">
                            com <span className="text-gray-900 font-semibold">{offer.partner.user.name}</span>
                        </p>
                    </div>

                    <div className="prose prose-green text-gray-600">
                        <p className="whitespace-pre-line leading-relaxed">
                            {offer.description || 'Assine este plano para ter acompanhamento personalizado diretamente pelo aplicativo da Player.Action.'}
                        </p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
                        <h3 className="font-semibold text-gray-900 flex items-center">
                            <ShieldCheck className="w-5 h-5 mr-2 text-green-600" /> O que está incluso na plataforma
                        </h3>
                        <ul className="space-y-3">
                            <li className="flex items-start">
                                <CheckCircle2 className="w-5 h-5 text-green-500 mr-2 shrink-0" />
                                <span className="text-sm text-gray-600">Acesso completo ao aplicativo Player.Action</span>
                            </li>
                            <li className="flex items-start">
                                <CheckCircle2 className="w-5 h-5 text-green-500 mr-2 shrink-0" />
                                <span className="text-sm text-gray-600">Treinos diários montados pelo seu treinador</span>
                            </li>
                            <li className="flex items-start">
                                <CheckCircle2 className="w-5 h-5 text-green-500 mr-2 shrink-0" />
                                <span className="text-sm text-gray-600">Acompanhamento de progresso e estatísticas</span>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Right column: Checkout Box */}
                <div className="md:col-span-2">
                    <Card className="sticky top-8 shadow-xl border-green-100">
                        <CardHeader className="bg-slate-50 border-b pb-6">
                            <CardTitle className="text-gray-500 text-sm font-medium uppercase tracking-wider">Assinatura Mensal</CardTitle>
                            <div className="mt-2 flex items-baseline text-4xl font-extrabold text-gray-900">
                                R$ {((offer.price || 0) + (offer.hourlyRate || 0)).toFixed(2).replace('.', ',')}
                                <span className="ml-1 text-xl font-medium text-gray-500">/mês</span>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <form onSubmit={handleCheckout} className="space-y-4">
                                {!session?.user ? (
                                    <>
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Seu Nome Completo</Label>
                                            <Input
                                                id="name"
                                                required
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                placeholder="João da Silva"
                                                disabled={submitting}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Seu Endereço de Email</Label>
                                            <Input
                                                id="email"
                                                type="email"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="joao@exemplo.com"
                                                disabled={submitting}
                                            />
                                            <p className="text-xs text-gray-500">
                                                Usaremos este email para liberar seu acesso ao app.
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mb-4">
                                        <p className="text-sm text-gray-500 mb-1">Logado como:</p>
                                        <p className="font-medium text-gray-900">{session.user.name}</p>
                                        <p className="text-sm text-gray-600">{session.user.email}</p>
                                    </div>
                                )}

                                <Button
                                    className="w-full h-12 text-lg font-semibold bg-green-600 hover:bg-green-700 shadow-md transition-all"
                                    type="submit"
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    ) : null}
                                    {submitting ? 'Processando...' : 'Ir para o Pagamento'}
                                </Button>

                                <p className="text-xs text-center text-gray-400 mt-4 flex items-center justify-center">
                                    Pagamento seguro processado por Stripe
                                </p>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}
