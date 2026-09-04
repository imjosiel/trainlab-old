'use client'

import { ROLES } from '@/lib/constants'
import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Loader2, MoreVertical, CheckCircle, XCircle, PauseCircle, Star, FileText, DollarSign, TrendingUp, AlertCircle, ArrowUpCircle } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function AdminPartnersPage() {
    const [partners, setPartners] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('ALL')

    // Modal states
    const [selectedPartner, setSelectedPartner] = useState(null)
    const [isMotivationModalOpen, setIsMotivationModalOpen] = useState(false)
    const [isActionModalOpen, setIsActionModalOpen] = useState(false)
    const [actionType, setActionType] = useState(null) // 'approve', 'reject', 'suspend'
    const [rejectionReason, setRejectionReason] = useState('')
    const [submitting, setSubmitting] = useState(false)

    // Financial Modal
    const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false)
    const [financials, setFinancials] = useState({
        customCommissionRate: '',
        minimumPayoutAmount: '5000',
        bonusThreshold: '',
        bonusRateDrop: ''
    })
    const [tierList, setTierList] = useState([])

    // Payout Modal
    const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false)
    const [payoutData, setPayoutData] = useState(null)
    const [payoutLoading, setPayoutLoading] = useState(false)
    const [forcingPayout, setForcingPayout] = useState(false)

    // Tier requests (mudanças de tier pendentes)
    const [tierRequests, setTierRequests] = useState([])
    const [reviewingRequest, setReviewingRequest] = useState(null)

    const fetchPartners = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/backend/admin/partners')
            if (res.ok) {
                const data = await res.json()
                setPartners(data.partners || [])
            } else {
                toast.error('Erro ao buscar parceiros. Você tem permissão?')
            }

            // Fetch tiers
            const tierRes = await fetch('/api/backend/admin/partner-tiers')
            if (tierRes.ok) {
                const tierData = await tierRes.json()
                setTierList(tierData.tiers || [])
            }

            // Fetch pending tier change requests
            const trRes = await fetch('/api/backend/admin/tier-requests?status=pending')
            if (trRes.ok) {
                const trData = await trRes.json()
                setTierRequests(trData.requests || [])
            }
        } catch (error) {
            toast.error('Erro de conexão com o servidor')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchPartners()
    }, [])

    const filteredPartners = partners.filter(p => {
        const matchesSearch = p.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
            p.user?.email?.toLowerCase().includes(search.toLowerCase())
        const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter
        return matchesSearch && matchesStatus
    })

    const openActionModal = (partner, action) => {
        setSelectedPartner(partner)
        setActionType(action)
        setRejectionReason('')
        setTimeout(() => setIsActionModalOpen(true), 0)
    }

    const handleActionSubmit = async () => {
        if ((actionType === 'reject' || actionType === 'suspend') && rejectionReason.trim().length < 5) {
            toast.error(`Por favor, informe um motivo para a ${actionType === 'reject' ? 'rejeição' : 'suspensão'}.`)
            return
        }

        setSubmitting(true)
        try {
            const res = await fetch(`/api/backend/admin/partners/${selectedPartner.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: actionType,
                    rejectionReason: actionType !== 'approve' ? rejectionReason : null
                })
            })

            if (res.ok) {
                toast.success('Ação executada com sucesso!')
                setIsActionModalOpen(false)
                fetchPartners() // refresh list
            } else {
                const data = await res.json()
                toast.error(data.error || 'Erro ao executar ação')
            }
        } catch (error) {
            toast.error('Erro de conexão com o servidor')
        } finally {
            setSubmitting(false)
        }
    }

    const renderStatusBadge = (status) => {
        switch (status) {
            case 'pending': return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Em Análise</Badge>
            case 'approved': return <Badge className="bg-green-100 text-green-800 border-green-200">Aprovado</Badge>
            case 'rejected': return <Badge variant="destructive">Rejeitado</Badge>
            case 'suspended': return <Badge variant="outline" className="border-red-500 text-red-600">Suspenso</Badge>
            default: return <Badge variant="outline">{status}</Badge>
        }
    }

    const renderTierBadge = (tier) => {
        const tierData = tierList.find(t => t.slug === tier?.toLowerCase())
        if (!tierData) return null

        const colorClass = tierData.slug === 'starter' ? 'text-slate-500' : 
                          tierData.slug === 'profissional' ? 'text-blue-600' : 
                          'text-purple-600'

        return <span className={`text-xs ${colorClass} font-medium`}>{tierData.name} ({(tierData.commissionRate * 100)}%)</span>
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b">
                <div>
                    <h3 className="text-lg font-medium">Gestão de Parceiros B2B</h3>
                    <p className="text-sm text-gray-500">
                        Aprove treinadores para o programa Player.Action Partners.
                    </p>
                </div>
            </div>

            {/* Filtros */}
            <Card className="shadow-sm">
                <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex-1 w-full relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <Input
                            placeholder="Buscar parceiro..."
                            className="pl-10 w-full"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                        <Button
                            variant={statusFilter === 'ALL' ? 'default' : 'outline'}
                            onClick={() => setStatusFilter('ALL')}
                        >
                            Todos
                        </Button>
                        <Button
                            variant={statusFilter === 'pending' ? 'default' : 'outline'}
                            className={statusFilter === 'pending' ? 'bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-600' : ''}
                            onClick={() => setStatusFilter('pending')}
                        >
                            Pendentes
                        </Button>
                        <Button
                            variant={statusFilter === 'approved' ? 'default' : 'outline'}
                            className={statusFilter === 'approved' ? 'bg-green-600 hover:bg-green-700 text-white border-green-700' : ''}
                            onClick={() => setStatusFilter('approved')}
                        >
                            Aprovados
                        </Button>
                        <Button
                            variant={statusFilter === 'suspended' ? 'default' : 'outline'}
                            className={statusFilter === 'suspended' ? 'bg-red-600 hover:bg-red-700 text-white border-red-700' : ''}
                            onClick={() => setStatusFilter('suspended')}
                        >
                            Suspensos
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Tabela */}
            <Card className="shadow-sm overflow-hidden border-gray-200">
                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-medium whitespace-nowrap">
                            <tr>
                                <th className="px-6 py-4">Treinador</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Motivação</th>
                                <th className="px-6 py-4">Stripe Connect</th>
                                <th className="px-6 py-4">Criado em</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-20 text-center">
                                        <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto" />
                                    </td>
                                </tr>
                            ) : filteredPartners.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-20 text-center text-gray-500">
                                        Nenhum parceiro encontrado.
                                    </td>
                                </tr>
                            ) : (
                                filteredPartners.map((partner) => (
                                    <tr key={partner.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold flex-shrink-0">
                                                    {partner.user?.name?.charAt(0) || 'U'}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                                                        {partner.user?.name}
                                                        {partner.user?.roles?.includes(ROLES.PARTNER) && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" title="Parceiro B2B Ativo" />}
                                                    </div>
                                                    <div className="text-gray-500 text-xs mt-1">
                                                        {partner.user?.email}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1 items-start">
                                                {renderStatusBadge(partner.status)}
                                                {partner.status === 'approved' && renderTierBadge(partner.partnerTier)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 max-w-[200px]">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-xs"
                                                onClick={() => {
                                                    setSelectedPartner(partner)
                                                    setIsMotivationModalOpen(true)
                                                }}
                                            >
                                                <FileText className="w-3 h-3 mr-2" />
                                                Ver Carta
                                            </Button>
                                        </td>
                                        <td className="px-6 py-4">
                                            {partner.stripeAccountId ? (
                                                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                                                    {partner.stripeAccountId}
                                                </Badge>
                                            ) : (
                                                <span className="text-xs text-gray-400">Não iniciado</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 text-sm whitespace-nowrap">
                                            {format(new Date(partner.createdAt), "dd MMM yyyy", { locale: ptBR })}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreVertical className="w-4 h-4 text-gray-500" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {partner.status === 'pending' || partner.status === 'suspended' || partner.status === 'rejected' ? (
                                                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openActionModal(partner, 'approve'); }}>
                                                            <span className="flex items-center text-green-600"><CheckCircle className="w-4 h-4 mr-2" /> Aprovar Parceiro</span>
                                                        </DropdownMenuItem>
                                                    ) : null}

                                                    {partner.status === 'pending' ? (
                                                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openActionModal(partner, 'reject'); }}>
                                                            <span className="flex items-center text-red-600"><XCircle className="w-4 h-4 mr-2" /> Rejeitar</span>
                                                        </DropdownMenuItem>
                                                    ) : null}

                                                    {partner.status === 'approved' ? (
                                                        <>
                                                            <DropdownMenuItem onSelect={(e) => {
                                                                e.preventDefault();
                                                                setSelectedPartner(partner)
                                                                setFinancials({
                                                                    customCommissionRate: partner.customCommissionRate ?? '',
                                                                    minimumPayoutAmount: partner.minimumPayoutAmount ?? 5000,
                                                                    bonusThreshold: partner.bonusThreshold ?? '',
                                                                    bonusRateDrop: partner.bonusRateDrop ?? ''
                                                                })
                                                                setTimeout(() => setIsFinancialModalOpen(true), 0)
                                                            }}>
                                                                <span className="flex items-center text-blue-600"><Star className="w-4 h-4 mr-2" /> Ajuste Financeiro VIP</span>
                                                            </DropdownMenuItem>
                                                            {partner.stripeAccountId && (
                                                                <DropdownMenuItem onSelect={async (e) => {
                                                                    e.preventDefault()
                                                                    setSelectedPartner(partner)
                                                                    setPayoutData(null)
                                                                    setIsPayoutModalOpen(true)
                                                                    setPayoutLoading(true)
                                                                    try {
                                                                        const res = await fetch(`/api/backend/admin/partners/${partner.id}/payouts`)
                                                                        const data = await res.json()
                                                                        setPayoutData(res.ok ? data : { error: data.error })
                                                                    } catch { setPayoutData({ error: 'Erro de conexão' }) }
                                                                    finally { setPayoutLoading(false) }
                                                                }}>
                                                                    <span className="flex items-center text-green-700"><DollarSign className="w-4 h-4 mr-2" /> Ver Repasses</span>
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openActionModal(partner, 'suspend'); }}>
                                                                <span className="flex items-center text-orange-600"><PauseCircle className="w-4 h-4 mr-2" /> Suspender Conta</span>
                                                            </DropdownMenuItem>
                                                        </>
                                                    ) : null}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Solicitações de Mudança de Tier */}
            {tierRequests.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 mt-2">
                        <ArrowUpCircle className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-medium">Solicitações de Upgrade de Tier
                            <span className="ml-2 bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{tierRequests.length}</span>
                        </h3>
                    </div>
                    <Card className="shadow-sm overflow-hidden border-blue-200">
                        <div className="divide-y">
                            {tierRequests.map(req => (
                                <div key={req.id} className="flex items-center justify-between gap-4 px-5 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                                            {req.partner.user?.name?.[0] || 'P'}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 text-sm">{req.partner.user?.name}</p>
                                            <p className="text-xs text-gray-500">{req.partner.user?.email}</p>
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        <span className="text-gray-400">{req.partner.tier?.name || 'Starter'}</span>
                                        <span className="mx-2">→</span>
                                        <span className="font-semibold text-blue-700">{req.toTier.name}</span>
                                        {req.toTier.price > 0 && (
                                            <span className="ml-1 text-xs text-gray-400">(R$ {req.toTier.price.toFixed(2)}/mês)</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <Button
                                            size="sm"
                                            className="bg-green-600 hover:bg-green-700 text-white"
                                            disabled={!!reviewingRequest}
                                            onClick={async () => {
                                                setReviewingRequest(req.id)
                                                const res = await fetch(`/api/backend/admin/tier-requests/${req.id}`, {
                                                    method: 'PATCH',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ action: 'approved' }),
                                                })
                                                const data = await res.json()
                                                if (res.ok) {
                                                    toast.success(data.message)
                                                    setTierRequests(prev => prev.filter(r => r.id !== req.id))
                                                } else {
                                                    toast.error(data.error || 'Erro ao aprovar')
                                                }
                                                setReviewingRequest(null)
                                            }}
                                        >
                                            {reviewingRequest === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                                            Aprovar
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            disabled={!!reviewingRequest}
                                            onClick={async () => {
                                                setReviewingRequest(req.id)
                                                const res = await fetch(`/api/backend/admin/tier-requests/${req.id}`, {
                                                    method: 'PATCH',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ action: 'rejected' }),
                                                })
                                                const data = await res.json()
                                                if (res.ok) {
                                                    toast.success('Pedido rejeitado.')
                                                    setTierRequests(prev => prev.filter(r => r.id !== req.id))
                                                } else {
                                                    toast.error(data.error || 'Erro ao rejeitar')
                                                }
                                                setReviewingRequest(null)
                                            }}
                                        >
                                            {reviewingRequest === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3 mr-1" />}
                                            Rejeitar
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            {/* Modal de Motivação */}
            <Dialog open={isMotivationModalOpen} onOpenChange={setIsMotivationModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Carta de Motivação</DialogTitle>
                        <DialogDescription>
                            Enviada por {selectedPartner?.user?.name} em {selectedPartner ? format(new Date(selectedPartner.createdAt), "dd/MM/yyyy HH:mm") : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="bg-slate-50 p-4 rounded-md text-slate-800 text-sm whitespace-pre-wrap max-h-[60vh] overflow-y-auto border">
                        {selectedPartner?.motivation || 'Nenhuma motivação informada.'}
                    </div>
                    {selectedPartner?.rejectionReason && (
                        <div className="mt-4">
                            <Label className="text-red-600">Histórico de Rejeição/Suspensão:</Label>
                            <div className="bg-red-50 p-3 mt-1 rounded text-sm text-red-800 border border-red-100">
                                {selectedPartner.rejectionReason}
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={() => setIsMotivationModalOpen(false)}>Fechar</Button>
                        {selectedPartner?.status === 'pending' && (
                            <Button className="bg-green-600 hover:bg-green-700" onClick={() => {
                                setIsMotivationModalOpen(false)
                                openActionModal(selectedPartner, 'approve')
                            }}>
                                Aprovar Agora
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Ação (Aprovar, Rejeitar, Suspender) */}
            <Dialog open={isActionModalOpen} onOpenChange={setIsActionModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {actionType === 'approve' && 'Aprovar Parceiro'}
                            {actionType === 'reject' && 'Rejeitar Candidatura'}
                            {actionType === 'suspend' && 'Suspender Parceiro'}
                        </DialogTitle>
                        <DialogDescription>
                            {actionType === 'approve' && `Você está prestes a aprovar ${selectedPartner?.user?.name} como Parceiro B2B Tier ${tierList.find(t => t.slug === 'starter')?.name || 'Starter'} (${(tierList.find(t => t.slug === 'starter')?.commissionRate || 0.35) * 100}%).`}
                            {actionType === 'reject' && `Diga a ${selectedPartner?.user?.name} por que a candidatura foi rejeitada.`}
                            {actionType === 'suspend' && `Suspenda a conta de ${selectedPartner?.user?.name}. Ele não poderá mais usar o Stripe Connect.`}
                        </DialogDescription>
                    </DialogHeader>

                    {actionType !== 'approve' && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="reason">Motivo da decisão:</Label>
                                <Textarea
                                    id="reason"
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    placeholder="Ex: Seu perfil ainda precisa de mais alunos ativos..."
                                    rows={4}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsActionModalOpen(false)}>Cancelar</Button>
                        <Button
                            variant={actionType === 'approve' ? 'default' : 'destructive'}
                            className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
                            onClick={handleActionSubmit}
                            disabled={submitting || (actionType !== 'approve' && rejectionReason.length < 5)}
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal Ajuste Financeiro */}
            <Dialog open={isFinancialModalOpen} onOpenChange={setIsFinancialModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ajustes Financeiros VIP</DialogTitle>
                        <DialogDescription>
                            Sobrescreva as regras globais para {selectedPartner?.user?.name}. Deixe em branco para usar as regras padrão (Atualmente configurado pelo Sistema).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Taxa Customizada (em decimal)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={financials.customCommissionRate}
                                onChange={(e) => setFinancials({ ...financials, customCommissionRate: e.target.value })}
                                placeholder="Ex: 0.10 para cobrar apenas 10%"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Saque Mínimo (em centavos)</Label>
                            <Input
                                type="number"
                                value={financials.minimumPayoutAmount}
                                onChange={(e) => setFinancials({ ...financials, minimumPayoutAmount: e.target.value })}
                                placeholder="Padrão: 5000 (R$ 50,00)"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFinancialModalOpen(false)}>Cancelar</Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={async () => {
                                setSubmitting(true)
                                try {
                                    const res = await fetch(`/api/backend/admin/partners/${selectedPartner.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            action: 'update_financials',
                                            financials
                                        })
                                    })
                                    if (res.ok) {
                                        toast.success("Financeiro atualizado com sucesso!")
                                        setIsFinancialModalOpen(false)
                                        fetchPartners()
                                    } else {
                                        toast.error("Erro ao atualizar")
                                    }
                                } finally {
                                    setSubmitting(false)
                                }
                            }}
                            disabled={submitting}
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Salvar Regras
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Histórico de Repasses */}
            <Dialog open={isPayoutModalOpen} onOpenChange={setIsPayoutModalOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-green-600" />
                            Repasses — {selectedPartner?.user?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Transferências e pagamentos Stripe para esta conta de parceiro.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-4 py-2">
                        {payoutLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                            </div>
                        ) : payoutData?.error ? (
                            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-md">
                                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                <p className="text-sm">{payoutData.error}</p>
                            </div>
                        ) : payoutData ? (
                            <>
                                {/* Saldo */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                                        <p className="text-xs text-green-700 font-medium mb-1">Saldo Disponível</p>
                                        <p className="text-2xl font-bold text-green-800">
                                            R$ {((payoutData.balance?.available ?? 0) / 100).toFixed(2).replace('.', ',')}
                                        </p>
                                    </div>
                                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
                                        <p className="text-xs text-orange-700 font-medium mb-1">Saldo Pendente</p>
                                        <p className="text-2xl font-bold text-orange-800">
                                            R$ {((payoutData.balance?.pending ?? 0) / 100).toFixed(2).replace('.', ',')}
                                        </p>
                                    </div>
                                </div>

                                {/* Repasses (Payouts para o banco) */}
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                                        <TrendingUp className="w-4 h-4" /> Pagamentos ao banco ({payoutData.payouts?.length ?? 0})
                                    </h4>
                                    {payoutData.payouts?.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">Nenhum pagamento ao banco ainda.</p>
                                    ) : (
                                        <div className="border rounded-md overflow-hidden text-sm">
                                            <table className="w-full">
                                                <thead className="bg-gray-50 text-xs text-gray-500">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left">Data</th>
                                                        <th className="px-3 py-2 text-left">Valor</th>
                                                        <th className="px-3 py-2 text-left">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {payoutData.payouts.map(p => (
                                                        <tr key={p.id}>
                                                            <td className="px-3 py-2 text-gray-600">{format(new Date(p.arrival_date * 1000), 'dd/MM/yyyy', { locale: ptBR })}</td>
                                                            <td className="px-3 py-2 font-medium">R$ {(p.amount / 100).toFixed(2).replace('.', ',')}</td>
                                                            <td className="px-3 py-2">
                                                                <Badge variant="outline" className={
                                                                    p.status === 'paid' ? 'bg-green-50 text-green-700 border-green-200' :
                                                                    p.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                                                    'bg-red-50 text-red-700 border-red-200'
                                                                }>{p.status}</Badge>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {/* Transfers da plataforma */}
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Transferências da plataforma ({payoutData.transfers?.length ?? 0})</h4>
                                    {payoutData.transfers?.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">Nenhuma transferência ainda.</p>
                                    ) : (
                                        <div className="border rounded-md overflow-hidden text-sm">
                                            <table className="w-full">
                                                <thead className="bg-gray-50 text-xs text-gray-500">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left">Data</th>
                                                        <th className="px-3 py-2 text-left">Valor</th>
                                                        <th className="px-3 py-2 text-left">Descrição</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {payoutData.transfers.map(t => (
                                                        <tr key={t.id}>
                                                            <td className="px-3 py-2 text-gray-600">{format(new Date(t.created * 1000), 'dd/MM/yyyy', { locale: ptBR })}</td>
                                                            <td className="px-3 py-2 font-medium">R$ {(t.amount / 100).toFixed(2).replace('.', ',')}</td>
                                                            <td className="px-3 py-2 text-gray-400 text-xs truncate max-w-[160px]">{t.description || t.id}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : null}
                    </div>

                    <DialogFooter className="border-t pt-4 gap-2">
                        <Button variant="outline" onClick={() => setIsPayoutModalOpen(false)}>Fechar</Button>
                        <Button
                            className="bg-green-600 hover:bg-green-700"
                            disabled={forcingPayout || payoutLoading || (payoutData?.balance?.available ?? 0) <= 0}
                            onClick={async () => {
                                setForcingPayout(true)
                                try {
                                    const res = await fetch(`/api/backend/admin/partners/${selectedPartner.id}/payouts`, { method: 'POST' })
                                    const data = await res.json()
                                    if (res.ok) {
                                        toast.success(`Repasse de R$ ${(data.payout.amount / 100).toFixed(2)} iniciado!`)
                                        setIsPayoutModalOpen(false)
                                    } else {
                                        toast.error(data.error || 'Erro ao forçar repasse')
                                    }
                                } catch { toast.error('Erro de conexão') }
                                finally { setForcingPayout(false) }
                            }}
                        >
                            {forcingPayout && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Forçar Repasse Agora
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    )
}
