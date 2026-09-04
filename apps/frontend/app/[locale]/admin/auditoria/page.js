'use client'
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Shield, Search, ChevronLeft, ChevronRight, RefreshCw, User, FileText, Settings, Users, Star, Dumbbell } from 'lucide-react'
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from '@/lib/audit-labels'

const ACTION_COLORS = {
    SETTINGS_UPDATED:         'bg-blue-100 text-blue-800',
    REPORT_GENERATED:         'bg-green-100 text-green-800',
    REPORT_UPDATED:           'bg-yellow-100 text-yellow-800',
    REPORT_PUBLISHED:         'bg-emerald-100 text-emerald-800',
    USER_ROLE_CHANGED:        'bg-purple-100 text-purple-800',
    USER_SYSTEM_ROLE_CHANGED: 'bg-red-100 text-red-800',
    PARTNER_APPROVED:         'bg-green-100 text-green-800',
    PARTNER_REJECTED:         'bg-red-100 text-red-800',
    PARTNER_UPDATED:          'bg-orange-100 text-orange-800',
    TIER_CREATED:             'bg-indigo-100 text-indigo-800',
    TIER_UPDATED:             'bg-indigo-100 text-indigo-800',
    TIER_DELETED:             'bg-red-100 text-red-800',
    SPORT_CREATED:            'bg-teal-100 text-teal-800',
    SPORT_UPDATED:            'bg-teal-100 text-teal-800',
    SPORT_DELETED:            'bg-red-100 text-red-800',
}

const ENTITY_ICONS = {
    PlatformFinanceSettings: <Settings className="w-3.5 h-3.5"/>,
    MonthlyReport:           <FileText className="w-3.5 h-3.5"/>,
    User:                    <User className="w-3.5 h-3.5"/>,
    PartnerAccount:          <Star className="w-3.5 h-3.5"/>,
    PartnerTier:             <Users className="w-3.5 h-3.5"/>,
    Sport:                   <Dumbbell className="w-3.5 h-3.5"/>,
}

function formatDate(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
}

export default function AuditoriaPage() {
    const [logs, setLogs] = useState([])
    const [total, setTotal] = useState(0)
    const [pages, setPages] = useState(1)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [entityFilter, setEntityFilter] = useState('')
    const [actorFilter, setActorFilter] = useState('')
    const [availableEntities, setAvailableEntities] = useState([])
    const [availableActors, setAvailableActors] = useState([])
    const [expandedId, setExpandedId] = useState(null)

    const fetchLogs = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ page, limit: 30 })
            if (search) params.set('search', search)
            if (entityFilter) params.set('entity', entityFilter)
            if (actorFilter) params.set('actorId', actorFilter)
            const res = await fetch(`/api/backend/admin/audit-logs?${params}`)
            const data = await res.json()
            setLogs(data.logs || [])
            setTotal(data.total || 0)
            setPages(data.pages || 1)
            if (data.filters?.entities?.length) setAvailableEntities(data.filters.entities)
            if (data.filters?.actors?.length) setAvailableActors(data.filters.actors)
        } finally {
            setLoading(false)
        }
    }, [page, search, entityFilter, actorFilter])

    useEffect(() => { fetchLogs() }, [fetchLogs])

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Shield className="w-6 h-6 text-blue-600"/>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Auditoria</h1>
                        <p className="text-sm text-gray-500">Histórico de todas as ações administrativas</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">{total} registro{total !== 1 ? 's' : ''}</span>
                    <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>
                    </Button>
                </div>
            </div>

            {/* Filtros */}
            <Card>
                <CardContent className="pt-4 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400"/>
                            <Input
                                className="pl-8 text-sm"
                                placeholder="Buscar por ação, entidade, usuário..."
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1) }}
                            />
                        </div>
                        <select
                            value={entityFilter}
                            onChange={e => { setEntityFilter(e.target.value); setPage(1) }}
                            className="border rounded-md px-3 py-2 text-sm bg-white text-gray-700"
                        >
                            <option value="">Todos os módulos</option>
                            {availableEntities.map(e => (
                                <option key={e} value={e}>{AUDIT_ENTITY_LABELS[e] || e}</option>
                            ))}
                        </select>
                        <select
                            value={actorFilter}
                            onChange={e => { setActorFilter(e.target.value); setPage(1) }}
                            className="border rounded-md px-3 py-2 text-sm bg-white text-gray-700"
                        >
                            <option value="">Todos os usuários</option>
                            {availableActors.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>
                </CardContent>
            </Card>

            {/* Tabela de logs */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">
                        {entityFilter || actorFilter || search ? 'Resultados filtrados' : 'Mais recentes primeiro'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="py-12 text-center text-gray-400 text-sm">Carregando...</div>
                    ) : logs.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">
                            <Shield className="w-8 h-8 mx-auto mb-2 opacity-30"/>
                            <p>Nenhuma ação registrada ainda.</p>
                            <p className="text-xs mt-1">As ações do painel admin aparecerão aqui automaticamente.</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {logs.map(log => (
                                <div key={log.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3 min-w-0">
                                            {/* Ícone da entidade */}
                                            <div className="mt-0.5 text-gray-400 flex-shrink-0">
                                                {ENTITY_ICONS[log.entity] || <Shield className="w-3.5 h-3.5"/>}
                                            </div>
                                            <div className="min-w-0">
                                                {/* Badge da ação */}
                                                <Badge className={`text-xs font-medium px-2 py-0.5 mr-2 ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700'}`}>
                                                    {AUDIT_ACTION_LABELS[log.action] || log.action}
                                                </Badge>
                                                {/* Entidade */}
                                                <span className="text-xs text-gray-400">
                                                    {AUDIT_ENTITY_LABELS[log.entity] || log.entity}
                                                    {log.entityId && <span className="text-gray-300"> #{log.entityId.slice(0, 8)}</span>}
                                                </span>
                                                {/* Ator */}
                                                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                                    <User className="w-3 h-3"/>
                                                    <span className="font-medium">{log.actorName}</span>
                                                </p>
                                                {/* Detalhes expandíveis */}
                                                {log.details && (
                                                    <button
                                                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                                                        className="text-xs text-blue-500 hover:underline mt-1"
                                                    >
                                                        {expandedId === log.id ? 'Ocultar detalhes' : 'Ver detalhes'}
                                                    </button>
                                                )}
                                                {expandedId === log.id && log.details && (
                                                    <pre className="mt-2 text-xs bg-gray-50 border rounded p-2 overflow-x-auto text-gray-600 max-w-2xl">
                                                        {JSON.stringify(log.details, null, 2)}
                                                    </pre>
                                                )}
                                            </div>
                                        </div>
                                        {/* Data */}
                                        <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                                            {formatDate(log.performedAt)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Paginação */}
            {pages > 1 && (
                <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Página {page} de {pages}</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                            <ChevronLeft className="w-4 h-4"/>
                        </Button>
                        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
                            <ChevronRight className="w-4 h-4"/>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
