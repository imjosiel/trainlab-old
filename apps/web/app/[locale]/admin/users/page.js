'use client'

import { ROLES } from '@/lib/constants'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Loader2, UserX, Shield, ShieldOff, Mail, MoreVertical, TrendingUp, ExternalLink, Star, CreditCard, Trash2, AlertCircle, RefreshCw } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function AdminUsersPage() {
    const router = useRouter()
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState('ALL')

    // Pagination
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    // Manual B2B Grant State
    const [selectedUserForB2B, setSelectedUserForB2B] = useState(null)
    const [trainers, setTrainers] = useState([])
    const [offers, setOffers] = useState([])
    const [selectedTrainerId, setSelectedTrainerId] = useState('')
    const [selectedOfferId, setSelectedOfferId] = useState('')
    const [isGranting, setIsGranting] = useState(false)
    const [isLoadingTrainers, setIsLoadingTrainers] = useState(false)

    // Delete User State
    const [userToDelete, setUserToDelete] = useState(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Tier Change State
    const [selectedUserForTier, setSelectedUserForTier] = useState(null)
    const [partnerTiers, setPartnerTiers] = useState([])
    const [selectedTierId, setSelectedTierId] = useState('')
    const [isChangingTier, setIsChangingTier] = useState(false)
    const [tierChangeReason, setTierChangeReason] = useState('')

    // Stripe Connect Manager State
    const [showStripeConnect, setShowStripeConnect] = useState(false)
    const [stripeAccounts, setStripeAccounts] = useState([])
    const [loadingStripe, setLoadingStripe] = useState(false)
    const [deletingAccountId, setDeletingAccountId] = useState(null)

    const fetchUsers = async (currentPage = 1) => {
        setLoading(true)
        try {
            const query = new URLSearchParams({
                page: currentPage,
                limit: 20,
                search: search,
                role: roleFilter
            })

            const res = await fetch(`/api/backend/admin/users?${query.toString()}`)
            if (res.ok) {
                const data = await res.json()
                setUsers(data.users || [])
                setTotalPages(data.pagination?.pages || 1)
                setPage(currentPage)
            }
        } catch (error) {
            toast.error('Erro ao buscar usuários')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchUsers(1)
    }, [roleFilter])

    useEffect(() => {
        if (selectedUserForB2B) {
            fetchTrainers()
        }
    }, [selectedUserForB2B])

    useEffect(() => {
        if (selectedUserForTier) {
            fetchPartnerTiers()
        }
    }, [selectedUserForTier])

    useEffect(() => {
        if (selectedTrainerId && trainers.length > 0) {
            fetchOffers(selectedTrainerId, trainers)
        } else {
            setOffers([])
            setSelectedOfferId('')
        }
    }, [selectedTrainerId, trainers])

    const fetchTrainers = async () => {
        setIsLoadingTrainers(true)
        try {
            const res = await fetch('/api/backend/admin/partners')
            if (res.ok) {
                const data = await res.json()
                setTrainers(data.partners || [])
            }
        } catch (error) {
            toast.error('Erro ao buscar treinadores')
        } finally {
            setIsLoadingTrainers(false)
        }
    }

    const fetchOffers = async (trainerId, trainersList = trainers) => {
        try {
            const partner = trainersList.find(p => p.userId === trainerId)
            if (!partner) return

            const res = await fetch(`/api/backend/partner/offers?partnerId=${partner.id}`)
            if (res.ok) {
                const data = await res.json()
                setOffers(data.offers || data || [])
            }
        } catch (error) {
            toast.error('Erro ao buscar ofertas')
        }
    }

    const handleDeleteUser = async () => {
        if (!userToDelete) return
        setIsDeleting(true)
        try {
            const res = await fetch(`/api/backend/admin/users/${userToDelete.id}`, { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) { toast.error(data.error ?? 'Erro ao excluir usuário'); return }
            toast.success(`Usuário ${userToDelete.email} excluído com sucesso.`)
            setUserToDelete(null)
            fetchUsers(page)
        } catch {
            toast.error('Erro ao excluir usuário')
        } finally {
            setIsDeleting(false)
        }
    }

    const handleGrantB2B = async () => {
        if (!selectedOfferId) {
            toast.error('Selecione uma oferta')
            return
        }

        setIsGranting(true)
        try {
            const res = await fetch(`/api/backend/admin/users/${selectedUserForB2B.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'grant_test_b2b',
                    offerId: selectedOfferId
                })
            })

            if (res.ok) {
                toast.success('Assinatura B2B concedida com sucesso!')
                setSelectedUserForB2B(null)
                fetchUsers(page)
            } else {
                const data = await res.json()
                toast.error(data.error || 'Erro ao conceder assinatura')
            }
        } catch (error) {
            toast.error('Erro de conexão')
        } finally {
            setIsGranting(false)
        }
    }

    const fetchPartnerTiers = async () => {
        try {
            const res = await fetch('/api/backend/admin/partner-tiers')
            if (res.ok) {
                const data = await res.json()
                setPartnerTiers(data.tiers || [])
            }
        } catch {
            toast.error('Erro ao buscar tiers')
        }
    }

    const handleChangeTier = async () => {
        if (!selectedTierId) { toast.error('Selecione um tier'); return }
        const partnerAccountId = selectedUserForTier?.partnerAccount?.id
        if (!partnerAccountId) { toast.error('Conta de parceiro não encontrada.'); return }

        setIsChangingTier(true)
        try {
            const res = await fetch(`/api/backend/admin/partners/${partnerAccountId}/tier`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toTierId: selectedTierId, reason: tierChangeReason || undefined })
            })
            const data = await res.json()
            if (res.ok) {
                toast.success(data.message)
                setSelectedUserForTier(null)
                setSelectedTierId('')
                setTierChangeReason('')
            } else {
                toast.error(data.error || 'Erro ao alterar tier')
            }
        } catch {
            toast.error('Erro de conexão')
        } finally {
            setIsChangingTier(false)
        }
    }

    const handleSearch = (e) => {
        e.preventDefault()
        fetchUsers(1)
    }

    const fetchStripeAccounts = async () => {
        setLoadingStripe(true)
        try {
            const res = await fetch('/api/backend/admin/stripe-connect')
            if (res.ok) {
                const data = await res.json()
                setStripeAccounts(data.accounts || [])
            } else {
                toast.error('Erro ao buscar contas Stripe.')
            }
        } catch {
            toast.error('Erro de conexão.')
        } finally {
            setLoadingStripe(false)
        }
    }

    const handleDeleteStripeAccount = async (accountId) => {
        if (!confirm(`Tem certeza que deseja deletar a conta ${accountId}? Esta ação é irreversível.`)) return
        setDeletingAccountId(accountId)
        try {
            const res = await fetch('/api/backend/admin/stripe-connect', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId })
            })
            const data = await res.json()
            if (res.ok) {
                toast.success(data.message)
                setStripeAccounts(prev => prev.filter(a => a.id !== accountId))
            } else {
                toast.error(data.error || 'Erro ao deletar conta.')
            }
        } catch {
            toast.error('Erro de conexão.')
        } finally {
            setDeletingAccountId(null)
        }
    }

    const openStripeConnect = () => {
        setShowStripeConnect(true)
        fetchStripeAccounts()
    }

    const handleAction = async (userId, actionName) => {
        try {
            const res = await fetch(`/api/backend/admin/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: actionName })
            })
            if (res.ok) {
                toast.success('Ação executada com sucesso!')
                fetchUsers(page)
            } else {
                const data = await res.json()
                toast.error(data.error || 'Erro ao executar ação')
            }
        } catch (error) {
            toast.error('Erro de conexão com o servidor')
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b">
                <div>
                    <h3 className="text-lg font-medium">Gestão de Usuários</h3>
                    <p className="text-sm text-gray-500">
                        Total de clientes e equipe registrados na plataforma.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-orange-200 text-orange-700 hover:bg-orange-50"
                    onClick={openStripeConnect}
                >
                    <CreditCard className="w-4 h-4" />
                    Contas Stripe Connect
                </Button>
            </div>

            {/* Filtros e Busca */}
            <Card className="shadow-sm">
                <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
                    <form onSubmit={handleSearch} className="flex-1 w-full relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <Input
                            placeholder="Buscar por nome ou e-mail..."
                            className="pl-10 w-full"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </form>

                    <div className="flex gap-2 w-full md:w-auto">
                        <Button
                            variant={roleFilter === 'ALL' ? 'default' : 'outline'}
                            className={roleFilter === 'ALL' ? 'bg-slate-900 border-slate-900 text-white' : ''}
                            onClick={() => setRoleFilter('ALL')}
                        >
                            Todos
                        </Button>
                        <Button
                            variant={roleFilter === ROLES.PROFESSIONAL ? 'default' : 'outline'}
                            className={roleFilter === ROLES.PROFESSIONAL ? 'bg-blue-600 border-blue-600 hover:bg-blue-700 text-white' : ''}
                            onClick={() => setRoleFilter(ROLES.PROFESSIONAL)}
                        >
                            Treinadores
                        </Button>
                        <Button
                            variant={roleFilter === ROLES.INDIVIDUAL ? 'default' : 'outline'}
                            className={roleFilter === ROLES.INDIVIDUAL ? 'bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-white' : ''}
                            onClick={() => setRoleFilter(ROLES.INDIVIDUAL)}
                        >
                            Atletas
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Tabela de Usuários */}
            <Card className="shadow-sm overflow-hidden border-gray-200">
                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-medium whitespace-nowrap">
                            <tr>
                                <th className="px-6 py-4">Usuário</th>
                                <th className="px-6 py-4">Papel</th>
                                <th className="px-6 py-4">Status / Plano</th>
                                <th className="px-6 py-4">Cadastro</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-20 text-center">
                                        <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto" />
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-20 text-center text-gray-500">
                                        Nenhum usuário encontrado com os filtros atuais.
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9 border border-gray-100">
                                                    <AvatarImage src={user.image} />
                                                    <AvatarFallback className="bg-green-50 text-green-700 font-bold">
                                                        {user.name?.[0] || 'U'}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                                                        <button
                                                            onClick={() => router.push(`/admin/users/${user.id}`)}
                                                            className="hover:underline text-green-700 text-left"
                                                        >
                                                            {user.name || 'Usuário Sem Nome'}
                                                        </button>
                                                        {user.systemRoles?.includes('ADMIN') && <Shield className="w-3 h-3 text-red-500" title="ADMIN" />}
                                                        {user.systemRoles?.includes('MODERATOR') && <Shield className="w-3 h-3 text-blue-500" title="MODERADOR" />}
                                                        {user.roles?.includes(ROLES.PARTNER) && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" title="PARCEIRO" />}
                                                    </div>
                                                    <div className="text-gray-500 text-xs flex items-center mt-1">
                                                        <Mail className="w-3 h-3 mr-1 text-gray-400" />
                                                        {user.email}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                {(user.roles?.length > 0 ? user.roles : [ROLES.CLIENT]).map(role => (
                                                    <Badge
                                                        key={role}
                                                        variant="outline"
                                                        className={`w-fit text-[10px] uppercase font-bold ${
                                                            role === ROLES.PROFESSIONAL ? 'border-blue-200 text-blue-700 bg-blue-50' :
                                                            role === ROLES.PARTNER ? 'border-yellow-300 text-yellow-700 bg-yellow-50' :
                                                            role === ROLES.INDIVIDUAL ? 'border-purple-200 text-purple-700 bg-purple-50' :
                                                            'border-gray-200 text-gray-600'
                                                        }`}
                                                    >
                                                        {role === ROLES.PARTNER ? 'PARCEIRO' : role}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <span className={`text-xs font-semibold ${user.subscriptionStatus === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                                                    {user.subscriptionStatus || 'sem plano'}
                                                </span>
                                                <span className="text-[10px] text-gray-500 uppercase tracking-tight">{user.subscriptionPlan || 'Free Limites'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 text-sm whitespace-nowrap">
                                            {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 text-green-600 hover:text-green-700 hover:bg-green-50 gap-1"
                                                    onClick={() => router.push(`/admin/users/${user.id}`)}
                                                >
                                                    <TrendingUp className="w-4 h-4" />
                                                    <span className="hidden lg:inline">Relatório</span>
                                                </Button>

                                                <DropdownMenu modal={false}>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreVertical className="w-4 h-4 text-gray-400" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        <DropdownMenuItem onClick={() => router.push(`/admin/users/${user.id}`)}>
                                                            <ExternalLink className="w-4 h-4 mr-2" /> Ver Detalhes
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleAction(user.id, 'toggle_admin')}>
                                                            {user.systemRoles?.includes('ADMIN') || user.systemRoles?.includes('MODERATOR') ? (
                                                                <span className="flex items-center text-red-600"><ShieldOff className="w-4 h-4 mr-2" /> Remover Admin</span>
                                                            ) : (
                                                                <span className="flex items-center"><Shield className="w-4 h-4 mr-2" /> Tornar Admin</span>
                                                            )}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleAction(user.id, 'grant_premium')}>
                                                            <span className="flex items-center text-green-600">Conceder Premium</span>
                                                        </DropdownMenuItem>
                                                        {user.subscriptionStatus === 'active' && (
                                                            <DropdownMenuItem onClick={() => handleAction(user.id, 'revoke_premium')}>
                                                                <span className="flex items-center text-red-600">Revogar Premium</span>
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem onClick={() => setSelectedUserForB2B(user)}>
                                                            <span className="flex items-center text-blue-600">Conceder Assinatura B2B</span>
                                                        </DropdownMenuItem>
                                                        {user.partnerAccount && (
                                                            <DropdownMenuItem onClick={() => { setSelectedUserForTier(user); setSelectedTierId(''); setTierChangeReason('') }}>
                                                                <span className="flex items-center text-purple-600">Alterar Tier Parceiro</span>
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem
                                                            onClick={() => setUserToDelete(user)}
                                                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                                        >
                                                            <Trash2 className="w-4 h-4 mr-2" /> Excluir Conta
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paginação */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                        <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === 1}
                                onClick={() => fetchUsers(page - 1)}
                            >
                                Anterior
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === totalPages}
                                onClick={() => fetchUsers(page + 1)}
                            >
                                Próxima
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            {/* Modal de Concessão B2B */}
            <Dialog open={!!selectedUserForB2B} onOpenChange={(open) => {
                if (!open) {
                    setSelectedUserForB2B(null)
                    setSelectedTrainerId('')
                    setSelectedOfferId('')
                    setOffers([])
                }
            }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Conceder Assinatura B2B (Mocks)</DialogTitle>
                        <DialogDescription>
                            Vincule <strong>{selectedUserForB2B?.name}</strong> a um plano de treinador manualmente para testes.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="trainer">Treinador Parceiro</Label>
                            <Select value={selectedTrainerId} onValueChange={setSelectedTrainerId}>
                                <SelectTrigger id="trainer">
                                    <SelectValue placeholder={isLoadingTrainers ? "Carregando..." : "Selecione um treinador"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {trainers.map((p) => (
                                        <SelectItem key={p.userId} value={p.userId}>
                                            {p.user?.name || 'Parceiro'} ({p.partnerTier})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {selectedTrainerId && (
                            <div className="grid gap-2">
                                <Label htmlFor="offer">Plano / Oferta</Label>
                                <Select value={selectedOfferId} onValueChange={setSelectedOfferId}>
                                    <SelectTrigger id="offer">
                                        <SelectValue placeholder="Selecione um plano" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {offers.map((o) => (
                                            <SelectItem key={o.id} value={o.id}>
                                                {o.name} - R$ {o.price.toFixed(2)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedUserForB2B(null)}>Cancelar</Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            disabled={!selectedOfferId || isGranting}
                            onClick={handleGrantB2B}
                        >
                            {isGranting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Conceder Acesso
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Alteração de Tier Parceiro */}
            <Dialog open={!!selectedUserForTier} onOpenChange={(open) => {
                if (!open) { setSelectedUserForTier(null); setSelectedTierId(''); setTierChangeReason('') }
            }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Alterar Tier Parceiro</DialogTitle>
                        <DialogDescription>
                            Mudança manual de tier para <strong>{selectedUserForTier?.name}</strong>.
                            Use quando o pagamento foi confirmado mas o webhook falhou.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Novo Tier</Label>
                            <Select value={selectedTierId} onValueChange={setSelectedTierId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione o tier..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {partnerTiers.map(t => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}{t.isDefault ? ' ★ (Padrão)' : ''} {t.price === 0 ? '(Gratuito)' : `— R$ ${t.price?.toFixed(2)}/mês`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Motivo (opcional)</Label>
                            <input
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                                placeholder="Ex: Webhook falhou após pagamento R$1"
                                value={tierChangeReason}
                                onChange={e => setTierChangeReason(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedUserForTier(null)}>Cancelar</Button>
                        <Button
                            className="bg-purple-600 hover:bg-purple-700"
                            disabled={!selectedTierId || isChangingTier}
                            onClick={handleChangeTier}
                        >
                            {isChangingTier && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Confirmar Alteração
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Gerenciamento Stripe Connect */}
            <Dialog open={showStripeConnect} onOpenChange={setShowStripeConnect}>
                <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-orange-600" />
                            Contas Stripe Connect
                        </DialogTitle>
                        <DialogDescription>
                            Gerencie as contas Express/Custom criadas no Stripe.
                            Contas <strong>Órfãs</strong> não estão vinculadas a nenhum parceiro no banco e podem ser deletadas com segurança.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
                        {loadingStripe ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
                            </div>
                        ) : stripeAccounts.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                Nenhuma conta Stripe Connect encontrada.
                            </div>
                        ) : (
                            stripeAccounts.map(account => (
                                <div
                                    key={account.id}
                                    className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                                        account.isOrphan ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono text-xs font-semibold text-gray-800">{account.id}</span>
                                            {account.isOrphan ? (
                                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" /> Órfã
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-100 text-green-700">Vinculada</span>
                                            )}
                                            {account.chargesEnabled && (
                                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Charges ✓</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {account.email ?? '—'}
                                            {account.metaUserId && <span className="ml-2 text-gray-400">userId: {account.metaUserId}</span>}
                                        </div>
                                        {account.dbRecord && (
                                            <div className="text-xs text-gray-400 mt-0.5">
                                                Parceiro: {account.dbRecord.user?.name ?? account.dbRecord.user?.email ?? '—'}
                                                <span className="ml-2 uppercase text-[10px]">{account.dbRecord.status}</span>
                                            </div>
                                        )}
                                        <div className="text-[10px] text-gray-400 mt-0.5">
                                            Criada em {new Date(account.createdAt).toLocaleDateString('pt-BR')}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                                        disabled={!account.isOrphan || deletingAccountId === account.id}
                                        title={account.isOrphan ? 'Deletar conta órfã' : 'Não é possível deletar conta vinculada'}
                                        onClick={() => handleDeleteStripeAccount(account.id)}
                                    >
                                        {deletingAccountId === account.id
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <Trash2 className="w-4 h-4" />}
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>

                    <DialogFooter className="border-t pt-3 mt-2">
                        <div className="flex items-center gap-2 text-xs text-gray-500 flex-1">
                            <AlertCircle className="w-3.5 h-3.5 text-orange-500" />
                            Contas vinculadas não podem ser deletadas por aqui.
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchStripeAccounts} disabled={loadingStripe}>
                            <RefreshCw className={`w-3.5 h-3.5 ${loadingStripe ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                        <Button variant="outline" onClick={() => setShowStripeConnect(false)}>Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Dialog: Confirmar exclusão de usuário ───────────────────── */}
            <Dialog open={!!userToDelete} onOpenChange={open => !open && setUserToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <Trash2 className="w-5 h-5" /> Excluir Conta
                        </DialogTitle>
                        <DialogDescription className="space-y-2 pt-2">
                            <p>Você está prestes a excluir permanentemente a conta de:</p>
                            <p className="font-semibold text-gray-900">{userToDelete?.name} ({userToDelete?.email})</p>
                            <p className="text-red-600 font-medium">
                                Esta ação é irreversível. Todos os dados do usuário serão excluídos,
                                incluindo planos de treino, sessões, assinaturas e histórico.
                            </p>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setUserToDelete(null)} disabled={isDeleting}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteUser}
                            disabled={isDeleting}
                        >
                            {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Excluir Permanentemente
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

