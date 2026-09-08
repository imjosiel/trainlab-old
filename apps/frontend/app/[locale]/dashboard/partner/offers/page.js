'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Loader2, Plus, Copy, Tag, Users, CheckCircle, Clock, MoreVertical, Pencil, Trash2, Archive, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

export default function PartnerOffersPage() {
    const { data: session } = useSession()
    const router = useRouter()

    const [offers, setOffers] = useState([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [tierAllowsHourlyRate, setTierAllowsHourlyRate] = useState(false)
    const [tierMinPrice, setTierMinPrice] = useState(0)

    // Criar oferta
    const [showForm, setShowForm] = useState(false)
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [hourlyRate, setHourlyRate] = useState('')
    const [hourlyLabel, setHourlyLabel] = useState('')

    // Editar oferta
    const [editingOffer, setEditingOffer] = useState(null)
    const [editName, setEditName] = useState('')
    const [editDescription, setEditDescription] = useState('')
    const [editPrice, setEditPrice] = useState('')
    const [editHourlyRate, setEditHourlyRate] = useState('')
    const [editHourlyLabel, setEditHourlyLabel] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    // Deletar oferta
    const [deletingOffer, setDeletingOffer] = useState(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showArchived, setShowArchived] = useState(false)

    const fetchOffers = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/backend/partner/offers')
            if (res.ok) {
                const data = await res.json()
                setOffers(data.offers || [])
                if (data.tier?.allowHourlyRate) setTierAllowsHourlyRate(true)
                if (typeof data.tier?.minPrice === 'number') setTierMinPrice(data.tier.minPrice)
            } else {
                const data = await res.json()
                if (data.error?.includes('candidatura')) {
                    router.push('/dashboard/partner/apply')
                } else if (data.error?.includes('Configure sua conta bancária')) {
                    toast.error(data.error)
                    router.push('/dashboard/partner/onboarding')
                } else {
                    toast.error('Erro ao carregar ofertas.')
                }
            }
        } catch (error) {
            toast.error('Erro de conexão ao buscar ofertas.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchOffers() }, [])

    const handleCreateOffer = async (e) => {
        e.preventDefault()
        const numericPrice = parseFloat(price.replace(',', '.'))
        if (!name || isNaN(numericPrice) || numericPrice < tierMinPrice) {
            toast.error(`Preencha o nome e um preço válido (mínimo R$ ${tierMinPrice.toFixed(2).replace('.', ',')}).`)
            return
        }
        setCreating(true)
        try {
            const body = { name, description, price: numericPrice }
            if (tierAllowsHourlyRate && hourlyRate) {
                body.hourlyRate = parseFloat(hourlyRate.replace(',', '.')) || 0
                body.hourlyLabel = hourlyLabel.trim() || 'Taxa de serviço'
            }
            const res = await fetch('/api/backend/partner/offers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            const data = await res.json()
            if (res.ok) {
                toast.success('Oferta criada com sucesso!')
                setName(''); setDescription(''); setPrice(''); setHourlyRate(''); setHourlyLabel('')
                setShowForm(false)
                fetchOffers()
            } else {
                toast.error(data.error || 'Erro ao criar oferta.')
                if (data.error?.includes('conta bancária')) router.push('/dashboard/partner/settings')
            }
        } catch { toast.error('Erro de conexão.') }
        finally { setCreating(false) }
    }

    const openEditDialog = (offer) => {
        setEditingOffer(offer)
        setEditName(offer.name)
        setEditDescription(offer.description || '')
        setEditPrice(offer.price.toString())
        setEditHourlyRate(offer.hourlyRate != null ? offer.hourlyRate.toString() : '')
        setEditHourlyLabel(offer.hourlyLabel || '')
    }

    const handleEditOffer = async (e) => {
        e.preventDefault()
        if (!editName.trim()) { toast.error('Nome é obrigatório'); return }
        const numericPrice = parseFloat(editPrice.replace(',', '.'))
        if (isNaN(numericPrice) || numericPrice < tierMinPrice) {
            toast.error(`Preço mínimo: R$ ${tierMinPrice.toFixed(2).replace('.', ',')}`)
            return
        }
        setIsSaving(true)
        try {
        const body = { name: editName.trim(), description: editDescription.trim(), price: numericPrice }
            if (tierAllowsHourlyRate) {
                const numericHourly = editHourlyRate !== '' ? parseFloat(editHourlyRate.replace(',', '.')) : null
                body.hourlyRate = (numericHourly && !isNaN(numericHourly)) ? numericHourly : null
                body.hourlyLabel = body.hourlyRate ? (editHourlyLabel.trim() || 'Taxa de serviço') : null
            }
            const res = await fetch(`/api/backend/partner/offers/${editingOffer.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            const data = await res.json()
            if (res.ok) {
                if (data.replaced) {
                    // Opção A: oferta arquivada, nova versão criada
                    toast.success('Preço atualizado! O plano anterior foi arquivado — novos alunos verão o novo valor. Alunos atuais mantêm o preço original.', { duration: 6000 })
                } else {
                    toast.success('Oferta atualizada!')
                }
                setEditingOffer(null)
                fetchOffers()
            } else {
                toast.error(data.error || 'Erro ao atualizar.')
            }
        } catch { toast.error('Erro de conexão.') }
        finally { setIsSaving(false) }
    }

    const handleDeleteOffer = async () => {
        setIsDeleting(true)
        try {
            const res = await fetch(`/api/backend/partner/offers/${deletingOffer.id}`, { method: 'DELETE' })
            const data = await res.json()
            if (res.ok) {
                toast.success('Oferta excluída.')
                setDeletingOffer(null)
                fetchOffers()
            } else {
                toast.error(data.error || 'Erro ao excluir.')
            }
        } catch { toast.error('Erro de conexão.') }
        finally { setIsDeleting(false) }
    }

    const copyInviteLink = (offerId) => {
        const url = `${window.location.origin}/invite/partner/${offerId}`
        navigator.clipboard.writeText(url)
        toast.success('Link de convite copiado!')
    }

    const computeTotal = () => {
        const base = parseFloat(price.replace(',', '.')) || 0
        const extra = parseFloat(hourlyRate.replace(',', '.')) || 0
        return base + extra
    }

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        )
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-12">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Suas Ofertas (Planos)</h1>
                    <p className="text-gray-500 mt-1">Crie pacotes de assinatura e compartilhe o link com seus alunos.</p>
                </div>
                <Button onClick={() => setShowForm(!showForm)} className="bg-green-600 hover:bg-green-700">
                    {showForm ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Nova Oferta</>}
                </Button>
            </div>

            {showForm && (
                <Card className="border-green-200 shadow-md bg-green-50/30">
                    <CardHeader>
                        <CardTitle>Criar Nova Oferta de Treino</CardTitle>
                        <CardDescription>
                            Ao criar essa oferta, geramos um link de pagamento recorrente (mensalidade) no Stripe vinculado à sua conta bancária.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreateOffer} className="space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nome do Plano</Label>
                                    <Input id="name" placeholder="Ex: Treino Personalizado Elite" value={name} onChange={(e) => setName(e.target.value)} disabled={creating} required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="price">
                                        Valor da Assinatura (BRL)
                                        {tierAllowsHourlyRate && <span className="text-gray-400 text-xs ml-1">— base mensal</span>}
                                    </Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                                        <Input id="price" type="number" step="0.01" min={tierMinPrice} placeholder={tierMinPrice > 0 ? tierMinPrice.toFixed(2) : '0.00'} className="pl-9" value={price} onChange={(e) => setPrice(e.target.value)} disabled={creating} required />
                                    </div>
                                </div>
                            </div>

                            {tierAllowsHourlyRate && (
                                <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                                        <Clock className="w-4 h-4" /> Taxa de Serviço (opcional)
                                    </div>
                                    <p className="text-xs text-amber-600">
                                        Valor adicional que você cobra pelo serviço presencial ou por hora. Vai 100% para você.
                                        O aluno verá o total: R$ {computeTotal().toFixed(2).replace('.', ',')}/mês.
                                    </p>
                                    <div className="grid sm:grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="hourlyRate">Valor da Taxa (BRL)</Label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                                                <Input id="hourlyRate" type="number" step="0.01" min="0" placeholder="300.00" className="pl-9" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} disabled={creating} />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="hourlyLabel">Nome da Taxa</Label>
                                            <Input id="hourlyLabel" placeholder="Ex: Presença semanal, Taxa por hora..." maxLength={60} value={hourlyLabel} onChange={(e) => setHourlyLabel(e.target.value)} disabled={creating} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="description">Descrição para o Aluno</Label>
                                <Textarea id="description" placeholder="Detalhe o que o aluno ganha ao assinar este plano..." rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={creating} />
                            </div>
                            <div className="pt-2 flex justify-end">
                                <Button type="submit" disabled={creating} className="bg-green-600 hover:bg-green-700">
                                    {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                    Finalizar e Criar Link
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {offers.length === 0 && !showForm ? (
                    <div className="col-span-full py-12 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        <Tag className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                        <h3 className="text-lg font-medium text-gray-900">Você ainda não tem ofertas ativas.</h3>
                        <p className="mt-1">Crie seu primeiro plano de assinatura para começar a convidar alunos.</p>
                        <Button variant="outline" className="mt-4" onClick={() => setShowForm(true)}>Criar Primeiro Plano</Button>
                    </div>
                ) : (
                    offers
                        .filter(offer => !offer.archivedAt)
                        .map((offer) => {
                        const total = offer.price + (offer.hourlyRate || 0)
                        return (
                            <Card key={offer.id} className="flex flex-col h-full hover:shadow-md transition-shadow">
                                <CardHeader className="pb-3 border-b">
                                    <div className="flex justify-between items-start gap-2">
                                        <CardTitle className="text-lg leading-tight line-clamp-2 flex-1 min-w-0">{offer.name}</CardTitle>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <div className="text-right">
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    R$ {total.toFixed(2).replace('.', ',')} / mês
                                                </span>
                                                {offer.hourlyRate > 0 && (
                                                    <p className="text-xs text-amber-600 mt-1">
                                                        R$ {offer.price.toFixed(2).replace('.', ',')} + R$ {offer.hourlyRate.toFixed(2).replace('.', ',')} {offer.hourlyLabel || 'taxa'}
                                                    </p>
                                                )}
                                            </div>
                                            <DropdownMenu modal={false}>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 -mt-1 shrink-0">
                                                        <MoreVertical className="w-4 h-4 text-gray-400" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-36">
                                                    <DropdownMenuItem onClick={() => openEditDialog(offer)}>
                                                        <Pencil className="w-4 h-4 mr-2" /> Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-red-600 focus:text-red-600"
                                                        onClick={() => setDeletingOffer(offer)}
                                                    >
                                                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                    <CardDescription className="line-clamp-2 mt-2 h-10">
                                        {offer.description || 'Sem descrição.'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-4 flex-grow">
                                    <div className="flex items-center text-sm text-gray-600 mb-2">
                                        <Users className="w-4 h-4 mr-2 text-gray-400" />
                                        <span>{offer._count?.subscriptions || 0} alunos ativos</span>
                                    </div>
                                    <div className="flex items-center text-sm text-gray-600">
                                        <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                                        <span>Sincronizado com Stripe</span>
                                    </div>
                                </CardContent>
                                <CardContent className="pt-0 pb-4">
                                    <Button
                                        variant="outline"
                                        className="w-full justify-between active:bg-slate-100 border-slate-300"
                                        onClick={() => copyInviteLink(offer.id)}
                                    >
                                        Copiar Link de Pagamento
                                        <Copy className="w-4 h-4 text-slate-500" />
                                    </Button>
                                </CardContent>
                            </Card>
                        )
                    })
                )}
            </div>

            {/* Histórico: Ofertas Arquivadas (Opção A) */}
            {offers.some(o => o.archivedAt) && (
                <div className="mt-2">
                    <button
                        onClick={() => setShowArchived(v => !v)}
                        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
                    >
                        {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        <Archive className="w-4 h-4" />
                        {showArchived ? 'Ocultar' : 'Ver'} histórico de ofertas arquivadas ({offers.filter(o => o.archivedAt).length})
                    </button>
                    {showArchived && (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-70">
                            {offers.filter(o => o.archivedAt).map(offer => {
                                const total = offer.price + (offer.hourlyRate || 0)
                                return (
                                    <Card key={offer.id} className="flex flex-col h-full border-dashed border-gray-300 bg-gray-50">
                                        <CardHeader className="pb-3 border-b">
                                            <div className="flex justify-between items-start gap-2">
                                                <CardTitle className="text-lg leading-tight line-clamp-2 flex-1 min-w-0 text-gray-500">{offer.name}</CardTitle>
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 shrink-0">
                                                    <Archive className="w-3 h-3 mr-1" /> Arquivado
                                                </span>
                                            </div>
                                            <CardDescription className="line-clamp-2 mt-2">{offer.description || 'Sem descrição.'}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="pt-4">
                                            <p className="text-sm text-gray-500">
                                                Preço original: <strong>R$ {total.toFixed(2).replace('.', ',')}/mês</strong>
                                            </p>
                                            <p className="text-xs text-gray-400 mt-1">
                                                {offer._count?.subscriptions || 0} aluno(s) ainda neste preço (grandfathered)
                                            </p>
                                            {offer.archivedAt && (
                                                <p className="text-xs text-gray-400 mt-1">
                                                    Arquivado em {new Date(offer.archivedAt).toLocaleDateString('pt-BR')}
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Dialog: Editar Oferta */}
            <Dialog open={!!editingOffer} onOpenChange={(open) => { if (!open) setEditingOffer(null) }}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Editar Oferta</DialogTitle>
                        <DialogDescription>
                            Alterações no nome sincronizam automaticamente com o Stripe.
                            {(editingOffer?._count?.subscriptions || 0) > 0 && (
                                <span className="block mt-1 text-blue-600 text-xs">ℹ️ Esta oferta tem assinantes ativos — ao alterar o preço, o plano atual será arquivado e uma nova versão será criada. Os alunos existentes mantêm o preço atual.</span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleEditOffer} className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Nome do Plano</Label>
                            <Input value={editName} onChange={e => setEditName(e.target.value)} disabled={isSaving} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Valor (BRL)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                                <Input
                                    type="number" step="0.01" min={tierMinPrice}
                                    className="pl-9"
                                    value={editPrice}
                                    onChange={e => setEditPrice(e.target.value)}
                                    disabled={isSaving || (editingOffer?._count?.subscriptions || 0) > 0}
                                />
                            </div>
                        </div>
                        {tierAllowsHourlyRate && (
                            <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-4 space-y-3">
                                <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                                    <Clock className="w-4 h-4" /> Taxa de Serviço (opcional)
                                </div>
                                {(editingOffer?._count?.subscriptions || 0) > 0 && (
                                    <p className="text-xs text-amber-600">⚠ Assinantes ativos — não é possível alterar a taxa.</p>
                                )}
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label>Valor da Taxa (BRL)</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                                            <Input
                                                type="number" step="0.01" min="0" placeholder="0.00"
                                                className="pl-9"
                                                value={editHourlyRate}
                                                onChange={e => setEditHourlyRate(e.target.value)}
                                                disabled={isSaving || (editingOffer?._count?.subscriptions || 0) > 0}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Nome da Taxa</Label>
                                        <Input
                                            placeholder="Ex: Presença semanal..."
                                            maxLength={60}
                                            value={editHourlyLabel}
                                            onChange={e => setEditHourlyLabel(e.target.value)}
                                            disabled={isSaving || (editingOffer?._count?.subscriptions || 0) > 0}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Descrição</Label>
                            <Textarea rows={3} value={editDescription} onChange={e => setEditDescription(e.target.value)} disabled={isSaving} />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" type="button" onClick={() => setEditingOffer(null)}>Cancelar</Button>
                            <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={isSaving}>
                                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Salvar Alterações
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Dialog: Confirmar Exclusão */}
            <Dialog open={!!deletingOffer} onOpenChange={(open) => { if (!open) setDeletingOffer(null) }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Excluir Oferta</DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja excluir <strong>"{deletingOffer?.name}"</strong>?
                            {(deletingOffer?._count?.subscriptions || 0) > 0
                                ? <span className="block mt-2 text-red-600 text-sm">⚠ Esta oferta tem assinantes — não pode ser excluída. Desative-a no lugar.</span>
                                : <span className="block mt-2 text-gray-500 text-sm">Essa ação não pode ser desfeita.</span>
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingOffer(null)}>Cancelar</Button>
                        <Button
                            variant="destructive"
                            disabled={isDeleting || (deletingOffer?._count?.subscriptions || 0) > 0}
                            onClick={handleDeleteOffer}
                        >
                            {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Excluir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
