'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, CheckCircle, Users, Star } from 'lucide-react'
import TermsCheckbox from '@/components/terms-checkbox'

function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export default function OfferCheckoutClient({ offer }) {
    const { data: session } = useSession()
    const [email, setEmail] = useState(session?.user?.email || '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [termsAccepted, setTermsAccepted] = useState(false)

    const trainer = offer.partner.user
    const activeStudents = offer._count.subscriptions

    async function handleSubscribe(e) {
        e.preventDefault()
        if (!termsAccepted) return
        setError('')
        setLoading(true)

        const res = await fetch(`/api/backend/partner/offers/${offer.id}/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                successUrl: `${window.location.origin}/dashboard`,
                cancelUrl: window.location.href,
            }),
        })

        const data = await res.json()
        if (!res.ok) {
            setError(data.error || 'Erro ao iniciar pagamento.')
            setLoading(false)
            return
        }

        // Redireciona para o Stripe Checkout
        window.location.href = data.url
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-6">

                {/* Card do treinador */}
                <div className="bg-card border rounded-2xl p-6 text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-muted mx-auto overflow-hidden">
                        {trainer.image ? (
                            <img src={trainer.image} alt={trainer.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl font-bold">
                                {trainer.name?.[0]}
                            </div>
                        )}
                    </div>
                    <div>
                        <p className="font-bold text-lg">{trainer.name}</p>
                        {trainer.username && (
                            <p className="text-sm text-muted-foreground">@{trainer.username}</p>
                        )}
                    </div>

                    <div className="border-t pt-4 space-y-1">
                        <h2 className="text-xl font-bold">{offer.name}</h2>
                        <p className="text-sm text-muted-foreground">{offer.description}</p>
                    </div>

                    <div className="flex items-center justify-center gap-6 text-sm pt-2">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-primary">{formatBRL(offer.price)}</p>
                            <p className="text-muted-foreground text-xs">por mês</p>
                        </div>
                        <div className="text-center">
                            <div className="flex items-center gap-1 justify-center">
                                <Users className="w-4 h-4 text-muted-foreground" />
                                <p className="font-semibold">{activeStudents}</p>
                            </div>
                            <p className="text-muted-foreground text-xs">alunos ativos</p>
                        </div>
                    </div>
                </div>

                {/* Formulário de assinatura */}
                <form onSubmit={handleSubscribe} className="bg-card border rounded-2xl p-6 space-y-4">
                    <h3 className="font-semibold">Assinar agora</h3>

                    {!session?.user && (
                        <div>
                            <label className="text-sm font-medium block mb-1">Seu email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="seu@email.com"
                                required
                                className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                    )}

                    {session?.user && (
                        <p className="text-sm text-muted-foreground">
                            Assinando como <span className="font-medium text-foreground">{session.user.email}</span>
                        </p>
                    )}

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} variant="checkout" className="mt-4" />

                    <button
                        type="submit"
                        disabled={!termsAccepted || loading}
                        className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Redirecionando...</>
                        ) : (
                            `Assinar por ${formatBRL(offer.price)}/mês`
                        )}
                    </button>

                    <p className="text-xs text-muted-foreground text-center">
                        🔒 Pagamento processado com segurança pelo Stripe. Cancele quando quiser.
                    </p>
                </form>

                {/* Garantias */}
                <div className="text-center space-y-2">
                    {[
                        'Cancele quando quiser, sem multa',
                        'Pagamento 100% seguro via Stripe',
                        'Acesso imediato após a confirmação',
                    ].map((item) => (
                        <div key={item} className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            {item}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
