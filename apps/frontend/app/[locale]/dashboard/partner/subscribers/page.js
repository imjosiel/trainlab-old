'use client'

import { useState, useEffect } from 'react'
import { Users, TrendingDown, Mail, Loader2 } from 'lucide-react'

function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

const STATUS_LABELS = {
    active: { label: 'Ativo', color: 'bg-green-500/15 text-green-600' },
    canceled: { label: 'Cancelado', color: 'bg-red-500/15   text-red-600' },
    past_due: { label: 'Em atraso', color: 'bg-yellow-500/15 text-yellow-600' },
    trialing: { label: 'Trial', color: 'bg-blue-500/15  text-blue-600' },
}

export default function PartnerSubscribersPage() {
    const [subscribers, setSubscribers] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    useEffect(() => {
        fetch('/api/backend/partner/subscribers')
            .then((r) => r.json())
            .then((d) => { setSubscribers(d.subscribers || []); setLoading(false) })
    }, [])

    const filtered = subscribers.filter(
        (s) => s.email.toLowerCase().includes(search.toLowerCase()) ||
            s.offer?.name?.toLowerCase().includes(search.toLowerCase())
    )

    const active = subscribers.filter((s) => s.status === 'active').length
    const mrr = subscribers
        .filter((s) => s.status === 'active')
        .reduce((acc, s) => acc + (s.offer?.price || 0), 0)

    return (
        <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Meus Alunos</h1>
                <p className="text-sm text-muted-foreground mt-1">Alunos inscritos nos seus planos.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-card border rounded-xl p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Users className="w-4 h-4" /> Alunos ativos
                    </div>
                    <p className="text-2xl font-bold">{active}</p>
                </div>
                <div className="bg-card border rounded-xl p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <TrendingDown className="w-4 h-4" /> MRR (sua parte)
                    </div>
                    <p className="text-2xl font-bold">{formatBRL(mrr)}</p>
                    <p className="text-xs text-muted-foreground">estimado</p>
                </div>
            </div>

            {/* Busca */}
            <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por email ou plano..."
                className="w-full bg-background border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {/* Lista */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                    <Users className="w-10 h-10 mx-auto opacity-30" />
                    <p>{search ? 'Nenhum resultado encontrado.' : 'Ainda não há alunos inscritos.'}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((s) => {
                        const statusInfo = STATUS_LABELS[s.status] || STATUS_LABELS.active
                        return (
                            <div key={s.id} className="bg-card border rounded-xl px-5 py-4 flex items-center gap-4">
                                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                                    <Mail className="w-4 h-4 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">{s.email}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {s.offer?.name} · {formatBRL(s.offer?.price || 0)}/mês
                                    </p>
                                </div>
                                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${statusInfo.color}`}>
                                    {statusInfo.label}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
