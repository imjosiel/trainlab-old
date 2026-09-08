'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, CheckCircle, Clock, XCircle, Ban, ChevronRight, Search, Filter } from 'lucide-react'

const STATUS_LABELS = {
    pending: { label: 'Pendente', color: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' },
    approved: { label: 'Aprovado', color: 'bg-green-500/15  text-green-600  border-green-500/30' },
    rejected: { label: 'Rejeitado', color: 'bg-red-500/15    text-red-600    border-red-500/30' },
    suspended: { label: 'Suspenso', color: 'bg-gray-500/15   text-gray-600   border-gray-500/30' },
}

const STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected', 'suspended']

export default function AdminPartnersPage() {
    const [partners, setPartners] = useState([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [statusFilter, setStatusFilter] = useState('all')
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(null)
    const [rejectModal, setRejectModal] = useState(null) // partnerId
    const [rejectReason, setRejectReason] = useState('')

    const fetchPartners = useCallback(async () => {
        setLoading(true)
        const params = new URLSearchParams({ page: String(page) })
        if (statusFilter !== 'all') params.set('status', statusFilter)
        const res = await fetch(`/api/backend/admin/partners?${params}`)
        const data = await res.json()
        setPartners(data.partners || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 1)
        setLoading(false)
    }, [page, statusFilter])

    useEffect(() => { fetchPartners() }, [fetchPartners])

    async function handleAction(partnerId, action, extra = {}) {
        setActionLoading(partnerId)
        await fetch(`/api/backend/admin/partners/${partnerId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...extra }),
        })
        setActionLoading(null)
        setRejectModal(null)
        setRejectReason('')
        fetchPartners()
    }

    const counts = {
        pending: partners.filter(p => p.status === 'pending').length,
        approved: partners.filter(p => p.status === 'approved').length,
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Parceiros B2B</h1>
                    <p className="text-muted-foreground text-sm">{total} total</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    {counts.pending > 0 && (
                        <span className="bg-yellow-500/15 text-yellow-600 border border-yellow-500/30 px-3 py-1 rounded-full font-medium">
                            {counts.pending} aguardando análise
                        </span>
                    )}
                </div>
            </div>

            {/* Filtros de status */}
            <div className="flex gap-2 flex-wrap">
                {STATUS_FILTERS.map((s) => (
                    <button
                        key={s}
                        onClick={() => { setStatusFilter(s); setPage(1) }}
                        className={`px-4 py-1.5 rounded-full text-sm border transition font-medium capitalize ${statusFilter === s
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card border-border text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        {s === 'all' ? 'Todos' : STATUS_LABELS[s]?.label}
                    </button>
                ))}
            </div>

            {/* Lista */}
            {loading ? (
                <div className="text-center py-12 text-muted-foreground">Carregando...</div>
            ) : partners.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>Nenhum parceiro encontrado.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {partners.map((p) => {
                        const statusInfo = STATUS_LABELS[p.status] || STATUS_LABELS.pending
                        return (
                            <div key={p.id} className="bg-card border rounded-xl p-5 flex items-center gap-4">
                                {/* Avatar */}
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                                    {p.user.image ? (
                                        <img src={p.user.image} alt={p.user.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-sm font-bold">{p.user.name?.[0] ?? '?'}</span>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold truncate">{p.user.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{p.user.email}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Tier: <span className="font-medium capitalize">{p.partnerTier}</span> ·{' '}
                                        Split: <span className="font-medium">{Math.round(p.commissionRate * 100)}%</span> ·{' '}
                                        Score de saúde: <span className="font-medium">{p.healthScore}</span>
                                    </p>
                                </div>

                                {/* Status badge */}
                                <span className={`text-xs px-3 py-1 rounded-full border font-medium shrink-0 ${statusInfo.color}`}>
                                    {statusInfo.label}
                                </span>

                                {/* Ações rápidas */}
                                <div className="flex gap-2 shrink-0">
                                    {p.status === 'pending' && (
                                        <>
                                            <button
                                                onClick={() => handleAction(p.id, 'approve')}
                                                disabled={actionLoading === p.id}
                                                className="text-xs bg-green-500/10 text-green-600 border border-green-500/30 px-3 py-1.5 rounded-lg hover:bg-green-500/20 transition font-medium disabled:opacity-50"
                                            >
                                                Aprovar
                                            </button>
                                            <button
                                                onClick={() => setRejectModal(p.id)}
                                                disabled={actionLoading === p.id}
                                                className="text-xs bg-red-500/10 text-red-600 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition font-medium disabled:opacity-50"
                                            >
                                                Rejeitar
                                            </button>
                                        </>
                                    )}
                                    {p.status === 'approved' && (
                                        <button
                                            onClick={() => handleAction(p.id, 'suspend')}
                                            disabled={actionLoading === p.id}
                                            className="text-xs bg-gray-500/10 text-gray-600 border border-gray-500/30 px-3 py-1.5 rounded-lg hover:bg-gray-500/20 transition font-medium disabled:opacity-50"
                                        >
                                            Suspender
                                        </button>
                                    )}
                                    {p.status === 'suspended' && (
                                        <button
                                            onClick={() => handleAction(p.id, 'reinstate')}
                                            disabled={actionLoading === p.id}
                                            className="text-xs bg-blue-500/10 text-blue-600 border border-blue-500/30 px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition font-medium disabled:opacity-50"
                                        >
                                            Reativar
                                        </button>
                                    )}
                                    <a
                                        href={`/admin/partners/${p.id}`}
                                        className="text-xs bg-muted border border-border px-3 py-1.5 rounded-lg hover:bg-muted/80 transition font-medium flex items-center gap-1"
                                    >
                                        Ver <ChevronRight className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Paginação */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 text-sm border rounded-lg disabled:opacity-40 hover:bg-muted transition"
                    >
                        Anterior
                    </button>
                    <span className="px-4 py-2 text-sm text-muted-foreground">
                        {page} / {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-4 py-2 text-sm border rounded-lg disabled:opacity-40 hover:bg-muted transition"
                    >
                        Próxima
                    </button>
                </div>
            )}

            {/* Modal de rejeição */}
            {rejectModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-card border rounded-2xl p-6 max-w-md w-full space-y-4">
                        <h3 className="font-bold text-lg">Rejeitar candidatura</h3>
                        <p className="text-sm text-muted-foreground">
                            Informe o motivo da rejeição. Ele será enviado ao treinador via notificação.
                        </p>
                        <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={4}
                            placeholder="Ex: Perfil incompleto, falta de experiência comprovada..."
                            className="w-full bg-background border rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setRejectModal(null); setRejectReason('') }}
                                className="flex-1 border rounded-lg py-2 text-sm hover:bg-muted transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleAction(rejectModal, 'reject', { rejectionReason: rejectReason })}
                                disabled={!rejectReason.trim()}
                                className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-600 transition disabled:opacity-50"
                            >
                                Confirmar rejeição
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
