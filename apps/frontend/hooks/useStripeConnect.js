'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadConnectAndInitialize } from '@stripe/connect-js'

/**
 * Hook para gerenciar a instância do Stripe Connect Embedded.
 * Cria/reutiliza a sessão do parceiro e carrega o SDK.
 *
 * @param {string[]} components - Lista de componentes a habilitar ex: ['account_onboarding']
 * @returns {{ stripeConnect, loading, error }}
 */
export function useStripeConnect(components = ['account_onboarding']) {
    const [stripeConnect, setStripeConnect] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const fetchClientSecret = useCallback(async () => {
        const res = await fetch('/api/backend/partner/connect/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ components }),
        })

        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Erro ao criar sessão Stripe Connect')
        }

        const { clientSecret } = await res.json()
        return clientSecret
    }, [components.join(',')])

    useEffect(() => {
        let cancelled = false

        async function init() {
            try {
                setLoading(true)
                setError(null)

                const instance = await loadConnectAndInitialize({
                    publishableKey: process.env.NEXT_PUBLIC_STRIPE_KEY,
                    fetchClientSecret,
                    appearance: {
                        overlays: 'drawer',
                        variables: {
                            colorPrimary: '#6366f1', // indigo — personaliza o visual do componente
                            fontFamily: 'Inter, sans-serif',
                            borderRadius: '8px',
                        },
                    },
                })

                if (!cancelled) setStripeConnect(instance)
            } catch (err) {
                if (!cancelled) setError(err.message)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        init()
        return () => { cancelled = true }
    }, [fetchClientSecret])

    return { stripeConnect, loading, error }
}
