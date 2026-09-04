'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Coins, ArrowDown, ArrowUp, RefreshCw, ShoppingBag, Clock, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const txTypeLabel = {
    GRANT: 'Créditos Recebidos',
    SPEND: 'Gasto',
    RESET: 'Reset Periódico',
    PURCHASE: 'Compra',
    REFUND: 'Reembolso',
}

const txTypeIcon = {
    GRANT: <ArrowDown className="w-4 h-4 text-green-500" />,
    SPEND: <ArrowUp className="w-4 h-4 text-red-500" />,
    RESET: <RefreshCw className="w-4 h-4 text-blue-500" />,
    PURCHASE: <ShoppingBag className="w-4 h-4 text-purple-500" />,
    REFUND: <ArrowDown className="w-4 h-4 text-orange-400" />,
}

export default function CreditsPage() {
    const [data, setData] = useState(null)
    const [packages, setPackages] = useState([])
    const [loading, setLoading] = useState(true)
    const [buyingPkg, setBuyingPkg] = useState(null)
    const searchParams = useSearchParams()

    useEffect(() => {
        const success = searchParams.get('success')
        const canceled = searchParams.get('canceled')
        if (success === '1') toast.success('Compra realizada! Seus créditos foram adicionados ao saldo.')
        if (canceled === '1') toast.info('Compra cancelada.')
        fetchAll()
    }, [])

    const fetchAll = async () => {
        setLoading(true)
        try {
            const [creditsRes, pkgsRes] = await Promise.all([
                fetch('/api/backend/credits').then(r => r.json()),
                fetch('/api/backend/credits/packages').then(r => r.json()),
            ])
            setData(creditsRes)
            setPackages(pkgsRes.packages || [])
        } catch {
            toast.error('Erro ao carregar créditos.')
        } finally {
            setLoading(false)
        }
    }

    const handleBuy = async (pkg) => {
        setBuyingPkg(pkg.id)
        try {
            const res = await fetch('/api/backend/stripe/checkout-credits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packageId: pkg.id }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            // Redirecionar para o Stripe Checkout
            window.location.href = json.url
        } catch (e) {
            toast.error(e.message || 'Erro ao iniciar compra.')
        } finally {
            setBuyingPkg(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-green-500" />
            </div>
        )
    }

    // Sistema de créditos desligado
    if (!data?.enabled) {
        return (
            <div className="max-w-2xl mx-auto text-center py-20">
                <Coins className="w-14 h-14 text-slate-300 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-slate-700 mb-2">Sistema de Créditos</h1>
                <p className="text-slate-500">O sistema de créditos está desativado no momento.</p>
            </div>
        )
    }

    const { planCredits, purchasedCredits, totalCredits, lastResetAt, costs, transactions } = data
    const balance = totalCredits ?? ((planCredits ?? 0) + (purchasedCredits ?? 0)) // compat

    return (
        <div className="max-w-4xl space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Coins className="w-7 h-7 text-yellow-500" />
                    Créditos
                </h1>
                <p className="text-slate-500 mt-1">Gerencie seu saldo e histórico de uso.</p>
            </div>

            {/* Cards principais */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Saldo total */}
                <div className="sm:col-span-2 bg-gradient-to-br from-yellow-400 to-orange-500 text-white rounded-2xl p-6 flex flex-col justify-between shadow-lg">
                    <div>
                        <p className="text-sm font-medium text-yellow-100">Saldo Total</p>
                        <p className="text-5xl font-bold mt-1">{balance.toLocaleString('pt-BR')}</p>
                        <p className="text-yellow-100 text-sm mt-1">créditos disponíveis</p>
                    </div>
                    {/* Sub-breakdown */}
                    <div className="mt-4 flex gap-4">
                        <div className="flex flex-col">
                            <span className="text-xs text-yellow-200">Do plano</span>
                            <span className="text-lg font-semibold">{(planCredits ?? 0).toLocaleString('pt-BR')}</span>
                            <span className="text-xs text-yellow-300">↻ reseta no ciclo</span>
                        </div>
                        <div className="w-px bg-yellow-300/40" />
                        <div className="flex flex-col">
                            <span className="text-xs text-yellow-200">Comprados</span>
                            <span className="text-lg font-semibold">{(purchasedCredits ?? 0).toLocaleString('pt-BR')}</span>
                            <span className="text-xs text-yellow-300">∞ não expiram</span>
                        </div>
                    </div>
                    {lastResetAt && (
                        <p className="text-xs text-yellow-200 mt-3 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Último reset: {new Date(lastResetAt).toLocaleDateString('pt-BR')}
                        </p>
                    )}
                </div>

                {/* Custos */}

                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Custo por Feature</p>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Gerar Plano (IA)</span>
                            <span className="font-bold text-slate-800">{costs?.planGen ?? '—'} <span className="text-xs font-normal text-yellow-600">créditos</span></span>
                        </div>
                        {costs?.aiVideo > 0 && (
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500">Gerar Vídeo IA</span>
                                <span className="font-bold text-slate-800">{costs.aiVideo} <span className="text-xs font-normal text-yellow-600">créditos</span></span>
                            </div>
                        )}
                    </div>
                    {balance < (costs?.planGen ?? 0) && (
                        <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg p-3">
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-600">Saldo insuficiente para gerar planos. Adquira um pacote abaixo.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Loja de Pacotes */}
            {packages.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-purple-500" />
                        Pacotes de Créditos
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {packages.map(pkg => (
                            <div key={pkg.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3 hover:border-yellow-400 hover:shadow-md transition-all">
                                <div>
                                    <p className="font-semibold text-slate-800">{pkg.name}</p>
                                    <p className="text-2xl font-bold text-yellow-500 mt-1">
                                        {pkg.credits.toLocaleString('pt-BR')}
                                        <span className="text-sm font-normal text-slate-500 ml-1">créditos</span>
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleBuy(pkg)}
                                    disabled={buyingPkg === pkg.id}
                                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium py-2 rounded-lg transition-all disabled:opacity-50"
                                >
                                    {buyingPkg === pkg.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            Comprar por R$ {pkg.price.toFixed(2)}
                                        </>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Histórico */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-slate-500" />
                    Histórico de Transações
                </h2>
                {(!transactions || transactions.length === 0) ? (
                    <p className="text-sm text-slate-400 text-center py-8">Nenhuma transação ainda.</p>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {transactions.map(tx => (
                            <div key={tx.id} className="flex items-center gap-3 py-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                    {txTypeIcon[tx.type] || <Coins className="w-4 h-4 text-slate-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700 truncate">
                                        {txTypeLabel[tx.type] || tx.type}
                                        {tx.feature && <span className="text-slate-400 font-normal"> · {tx.feature}</span>}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        {tx.description || '—'} · {new Date(tx.createdAt).toLocaleString('pt-BR')}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className={`font-semibold text-sm ${tx.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                                    </p>
                                    <p className="text-xs text-slate-400">saldo: {tx.balanceAfter}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
