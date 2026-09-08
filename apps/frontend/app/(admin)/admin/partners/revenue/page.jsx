'use client'

import { useState, useEffect } from 'react'
import {
    Handshake, Users, TrendingUp, DollarSign, CheckCircle, Clock, Loader2
} from 'lucide-react'

function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export default function AdminPartnersRevenuePage() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/backend/admin/partners/revenue')
            .then((r) => r.json())
            .then((d) => { setData(d); setLoading(false) })
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
            </div>
        )
    }

    const { overview, topPartners } = data

    const stats = [
        {
            label: 'MRR B2B (plataforma)',
            value: formatBRL(overview.b2bPlatformMRR),
            sub: 'receita mensal da plataforma via parceiros',
            Icon: DollarSign,
            highlight: true,
        },
        {
            label: 'Alunos de Parceiros',
            value: overview.activeSubscriptions,
            sub: `${overview.totalSubscriptions} total`,
            Icon: Users,
        },
        {
            label: 'Parceiros Aprovados',
            value: overview.approvedPartners,
            sub: `${overview.totalPartners} candidatos`,
            Icon: Handshake,
        },
        {
            label: 'Usuários SaaS Ativos',
            value: overview.saasActiveUsers,
            sub: 'com assinatura ativa',
            Icon: CheckCircle,
        },
    ]

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold">Receita da Plataforma</h1>
                <p className="text-muted-foreground text-sm mt-1">Visão consolidada: SaaS + B2B</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map(({ label, value, sub, Icon, highlight }) => (
                    <div
                        key={label}
                        className={`rounded-xl border p-5 ${highlight ? 'bg-primary/5 border-primary/30' : 'bg-card'}`}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm text-muted-foreground font-medium">{label}</p>
                            <Icon className={`w-4 h-4 ${highlight ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <p className={`text-2xl font-bold ${highlight ? 'text-primary' : ''}`}>{value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                    </div>
                ))}
            </div>

            {/* Top Parceiros */}
            <div>
                <h2 className="text-lg font-semibold mb-4">Top Parceiros por Receita</h2>
                {topPartners.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Nenhum parceiro ativo ainda.</p>
                ) : (
                    <div className="space-y-2">
                        {topPartners.map((p, i) => (
                            <div key={p.id} className="bg-card border rounded-xl px-5 py-4 flex items-center gap-4">
                                <span className="text-xl font-bold text-muted-foreground w-7 text-center shrink-0">
                                    {i + 1}
                                </span>
                                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                                    {p.user.image ? (
                                        <img src={p.user.image} alt={p.user.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-sm font-bold">{p.user.name?.[0]}</span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm truncate">{p.user.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {p.activeStudents} alunos · Tier: <span className="capitalize">{p.partnerTier}</span>
                                        {' '}· Split: {Math.round(p.commissionRate * 100)}%
                                    </p>
                                </div>
                                <div className="text-right shrink-0 space-y-0.5">
                                    <p className="font-bold text-sm">{formatBRL(p.platformRevenue)}</p>
                                    <p className="text-xs text-muted-foreground">
                                        plataforma/mês de {formatBRL(p.totalRevenue)} GMV
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
