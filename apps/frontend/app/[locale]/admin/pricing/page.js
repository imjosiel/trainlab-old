'use client'

import { ROLES } from '@/lib/constants'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Loader2, Plus, Edit2, Trash2, Settings2, Coins } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function SaaSPricingAdminPage() {
    const [tiers, setTiers] = useState([])
    const [partnerTiers, setPartnerTiers] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadingPartners, setLoadingPartners] = useState(true)

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingTier, setEditingTier] = useState(null)

    const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false)
    const [editingPartnerTier, setEditingPartnerTier] = useState(null)

    const fetchTiers = async () => {
        try {
            const response = await fetch('/api/backend/admin/tiers')
            if (response.ok) {
                const data = await response.json()
                setTiers(data.tiers || [])
            }
        } catch (error) {
            toast.error('Erro ao carregar os planos')
        } finally {
            setLoading(false)
        }
    }

    const fetchPartnerTiers = async () => {
        try {
            const response = await fetch('/api/backend/admin/partner-tiers')
            if (response.ok) {
                const data = await response.json()
                setPartnerTiers(data.tiers || [])
            }
        } catch (error) {
            toast.error('Erro ao carregar os tiers de parceiros')
        } finally {
            setLoadingPartners(false)
        }
    }

    useEffect(() => {
        fetchTiers()
        fetchPartnerTiers()
    }, [])

    const handleDelete = async (id) => {
        if (!confirm('Deseja realmente deletar este plano de assinatura? Issso pode afetar a exibição da landing page.')) return
        try {
            const response = await fetch(`/api/backend/admin/tiers/${id}`, { method: 'DELETE' })
            if (!response.ok) throw new Error('Falha ao excluir')
            toast.success('Plano excluído com sucesso')
            fetchTiers()
        } catch (err) {
            toast.error(err.message)
        }
    }

    const handleDeletePartnerTier = async (id) => {
        if (!confirm('Deseja deletar este Tier de Parceiro?')) return
        try {
            const response = await fetch(`/api/backend/admin/partner-tiers/${id}`, { method: 'DELETE' })
            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Falha ao excluir')
            }
            toast.success('Tier removido com sucesso')
            fetchPartnerTiers()
        } catch (err) {
            toast.error(err.message)
        }
    }

    return (
        <div className="space-y-6">
            <div className="pb-4 border-b">
                <h3 className="text-2xl font-bold tracking-tight">Planos e Precificação</h3>
                <p className="text-sm text-gray-500">Gerencie planos de assinatura SaaS e regras de comissão para parceiros B2B.</p>
            </div>

            <Tabs defaultValue="partners" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                    <TabsTrigger value="partners">Tiers de Parceiros</TabsTrigger>
                    <TabsTrigger value="saas">Assinaturas SaaS</TabsTrigger>
                </TabsList>

                {/* --- ABA 1: ASSINATURAS SAAS --- */}
                <TabsContent value="saas" className="pt-6 space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h4 className="font-semibold text-lg">Modelos de Assinatura</h4>
                            <p className="text-xs text-gray-400">Pacotes visíveis na Landing Page e tela de checkout.</p>
                        </div>
                        <Button className="bg-green-600 hover:bg-green-700" onClick={() => { setEditingTier(null); setIsModalOpen(true); }}>
                            <Plus className="w-4 h-4 mr-2" />
                            Novo Plano SaaS
                        </Button>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-green-600" /></div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {tiers.map(tier => (
                                <Card key={tier.id} className={`relative flex flex-col ${tier.isPopular ? 'border-green-500 ring-1 ring-green-500' : ''}`}>
                                    {tier.isPopular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-white text-[10px] font-bold rounded-full">Destaque</div>}
                                    <CardHeader className="pb-2">
                                        <CardTitle>{tier.name}</CardTitle>
                                        <CardDescription className="text-xs">{tier.description}</CardDescription>
                                        <div className="mt-2 text-3xl font-bold">R$ {tier.price.toFixed(2)}<span className="text-xs text-gray-400 font-normal">/mês</span></div>
                                    </CardHeader>
                                    <CardContent className="flex-1">
                                        <div className="text-[10px] text-gray-500 space-y-1">
                                            <p>Price ID: {tier.stripePriceId}</p>
                                            <p>Limite Atletas: {tier.maxAthletes > 900 ? 'Ilimitado' : tier.maxAthletes}</p>
                                            {tier.videoQualityHeights?.length > 0 && (
                                                <p>🎬 Qualidade: {tier.videoQualityHeights.map(h => `${h}p`).join(' + ')}</p>
                                            )}
                                        </div>
                                    </CardContent>
                                    <CardFooter className="bg-gray-50/50 border-t p-3 flex gap-2">
                                        <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => { setEditingTier(tier); setIsModalOpen(true); }}><Edit2 className="w-3 h-3 mr-1" /> Editar</Button>
                                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(tier.id)}><Trash2 className="w-3 h-3" /></Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* --- ABA 2: TIERS DE PARCEIROS --- */}
                <TabsContent value="partners" className="pt-6 space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h4 className="font-semibold text-lg">Gestão de Tiers B2B</h4>
                            <p className="text-xs text-gray-400">Defina as taxas de comissão (Take Rate) que a plataforma retém nas vendas dos parceiros.</p>
                        </div>
                        <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => { setEditingPartnerTier(null); setIsPartnerModalOpen(true); }}>
                            <Plus className="w-4 h-4 mr-2" />
                            Novo Tier de Parceiro
                        </Button>
                    </div>

                    {loadingPartners ? (
                        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-600" /></div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {partnerTiers.map(tier => (
                                <Card key={tier.id} className={`border-blue-100 bg-blue-50/10 ${tier.isDefault ? 'ring-2 ring-green-400' : ''}`}>
                                    <CardHeader className="pb-2">
                                        <div className="flex justify-between items-start">
                                            <CardTitle className="text-blue-900">{tier.name}</CardTitle>
                                            <div className="flex gap-1 flex-wrap justify-end">
                                                <Badge variant="outline" className="text-[9px] uppercase">{tier.slug}</Badge>
                                                {tier.isDefault && <Badge className="text-[9px] bg-green-100 text-green-700 border-green-300">Padrão</Badge>}
                                                {!tier.isActive && <Badge className="text-[9px] bg-red-100 text-red-600 border-red-200">Inativo</Badge>}
                                            </div>
                                        </div>
                                        <CardDescription className="text-xs h-8 line-clamp-2">{tier.description}</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex gap-4 items-end flex-wrap">
                                            <div>
                                                <div className="text-4xl font-black text-blue-600">{(tier.commissionRate * 100).toFixed(0)}%</div>
                                                <p className="text-[10px] text-blue-800 font-medium">Taxa de Comissão (Take Rate)</p>
                                            </div>
                                            <div>
                                                <div className="text-xl font-bold text-gray-700">R$ {tier.minPrice?.toFixed(2) || '0.00'}</div>
                                                <p className="text-[10px] text-gray-500 font-medium">Preço Mínimo</p>
                                            </div>
                                            <div>
                                                <div className="text-xl font-bold text-gray-700">{tier.maxPlansPerMonth ?? '∞'}</div>
                                                <p className="text-[10px] text-gray-500 font-medium">Planos/aluno/mês</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="bg-blue-50/30 border-t border-blue-100 p-3 flex gap-2">
                                        <Button variant="ghost" size="sm" className="flex-1 text-xs text-blue-700 hover:bg-blue-100" onClick={() => { setEditingPartnerTier(tier); setIsPartnerModalOpen(true); }}>
                                            <Edit2 className="w-3 h-3 mr-1" /> Configurar
                                        </Button>
                                        <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => handleDeletePartnerTier(tier.id)}>
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {isModalOpen && (
                <TierFormModal
                    tier={editingTier}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => { setIsModalOpen(false); fetchTiers(); }}
                />
            )}

            {isPartnerModalOpen && (
                <PartnerTierFormModal
                    tier={editingPartnerTier}
                    onClose={() => setIsPartnerModalOpen(false)}
                    onSuccess={() => { setIsPartnerModalOpen(false); fetchPartnerTiers(); }}
                />
            )}
        </div>
    )
}

// ─── PartnerTierFormModal ──────────────────────────────────────────────────────

function PartnerTierFormModal({ tier, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        name: tier?.name || '',
        slug: tier?.slug || '',
        commissionRate: tier ? tier.commissionRate * 100 : 50,
        minPrice: tier ? tier.minPrice : 99.90,
        price: tier ? (tier.price ?? 0) : 0,
        description: tier?.description || '',
        maxAthletes: tier ? (tier.maxAthletes ?? '') : '',
        maxPlansPerMonth: tier ? (tier.maxPlansPerMonth ?? '') : 10,
        payoutSchedule: tier?.payoutSchedule || 'monthly',
        payoutDelayDays: tier?.payoutDelayDays ?? 7,
        isActive: tier ? tier.isActive : true,
        isDefault: tier ? tier.isDefault : false,
        allowFlexibleDistribution: tier?.allowFlexibleDistribution ?? false,
        allowHourlyRate: tier?.allowHourlyRate ?? false,
        hourlyRatePolicy: tier?.hourlyRatePolicy || 'base_only',
        creditsPerPeriod: tier?.creditsPerPeriod ?? '',
        creditResetPeriod: tier?.creditResetPeriod || 'monthly',
    })
    const [saving, setSaving] = useState(false)

    // Video quality state
    const initialQuality = inferQualityMode(tier?.videoQualityHeights)
    const [qualityMode, setQualityMode] = useState(initialQuality.mode)
    const [qualityMax, setQualityMax] = useState(initialQuality.max || 1080)
    const [qualityMin, setQualityMin] = useState(initialQuality.min || 480)
    const [qualityOnly, setQualityOnly] = useState(initialQuality.list || [720, 1080])
    const toggleOnly = (h) => setQualityOnly(prev =>
        prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h].sort((a, b) => a - b)
    )
    const effectiveHeights = qualityModeToHeights(qualityMode, qualityMin, qualityMax, qualityOnly)


    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            const payload = {
                ...formData,
                commissionRate: formData.commissionRate / 100,
                minPrice: parseFloat(formData.minPrice) || 0,
                price: parseFloat(formData.price) || 0,
                maxAthletes: formData.maxAthletes === '' || formData.maxAthletes === 0 ? null : parseInt(formData.maxAthletes),
                maxPlansPerMonth: formData.maxPlansPerMonth === '' || formData.maxPlansPerMonth === 0 ? null : parseInt(formData.maxPlansPerMonth),
                payoutDelayDays: parseInt(formData.payoutDelayDays) || 7,
                creditsPerPeriod: formData.creditsPerPeriod !== '' ? parseInt(formData.creditsPerPeriod) : null,
                videoQualityHeights: effectiveHeights,
            }
            const url = tier ? `/api/backend/admin/partner-tiers/${tier.id}` : '/api/backend/admin/partner-tiers'
            const method = tier ? 'PUT' : 'POST'
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            if (!res.ok) throw new Error('Erro ao salvar')
            toast.success('Tier salvo com sucesso!')
            onSuccess()
        } catch (err) {
            toast.error(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <Card className="w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-blue-600" />
                        {tier ? 'Editar Tier de Parceiro' : 'Novo Tier de Parceiro'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="overflow-y-auto flex-1">
                    <form id="partnerTierForm" onSubmit={handleSubmit} className="space-y-4">

                        {/* Identidade */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nome de Exibição</Label>
                                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Premium Gold" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Slug</Label>
                                <Input value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value })} placeholder="ex: gold" disabled={!!tier} required />
                            </div>
                        </div>

                        {/* Financeiro */}
                        <div className="grid grid-cols-3 gap-4 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                            <div className="space-y-2">
                                <Label>Taxa da Plataforma (%)</Label>
                                <Input type="number" min={0} max={100} step={0.1}
                                    value={formData.commissionRate}
                                    onChange={e => setFormData({ ...formData, commissionRate: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                    required />
                                <p className="text-xs text-gray-400">% retido de cada cobrança</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Preço do Tier (R$/mês)</Label>
                                <Input type="number" step="0.01" min={0} value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} placeholder="0 = gratuito" />
                                <p className="text-xs text-gray-400">Pago pelo treinador</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Val. Mínimo de Venda (R$)</Label>
                                <Input type="number" step="0.01" min={0} value={formData.minPrice} onChange={e => setFormData({ ...formData, minPrice: e.target.value })} required />
                            </div>
                        </div>

                        {/* Repasse */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Frequência de Repasse</Label>
                                <select value={formData.payoutSchedule} onChange={e => setFormData({ ...formData, payoutSchedule: e.target.value })}
                                    className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="daily">Diário</option>
                                    <option value="weekly">Semanal</option>
                                    <option value="monthly">Mensal</option>
                                    <option value="manual">Manual (plataforma libera)</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>
                                    Carência após cobrança (dias)
                                    {formData.payoutSchedule === 'manual' && <span className="ml-1 text-gray-400 text-xs">(não aplicável)</span>}
                                </Label>
                                <Input type="number" min={0} max={90} value={formData.payoutDelayDays}
                                    onChange={e => setFormData({ ...formData, payoutDelayDays: e.target.value })}
                                    placeholder="Ex: 7"
                                    disabled={formData.payoutSchedule === 'manual'} />
                            </div>
                        </div>

                        {/* Limites */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Máx. Atletas</Label>
                                <Input type="number" min={1} value={formData.maxAthletes} onChange={e => setFormData({ ...formData, maxAthletes: e.target.value })} placeholder="Vazio = ilimitado" />
                            </div>
                            <div className="space-y-2">
                                <Label>Máx. Planos/Aluno/Mês</Label>
                                <Input type="number" min={1} value={formData.maxPlansPerMonth} onChange={e => setFormData({ ...formData, maxPlansPerMonth: e.target.value })} placeholder="Vazio = ilimitado" />
                            </div>
                        </div>


                        {/* Qualidade de Video */}
                        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 space-y-3">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-purple-800">🎬 Qualidade de Vídeo</p>
                                <p className="text-xs text-purple-500">(nunca upscala além da resolução original)</p>
                            </div>
                            <div className="grid grid-cols-3 gap-3 items-end">
                                <div className="space-y-1">
                                    <Label className="text-xs">Modo</Label>
                                    <select value={qualityMode} onChange={e => setQualityMode(e.target.value)}
                                        className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400">
                                        <option value="UP_TO">Até</option>
                                        <option value="BETWEEN">Entre</option>
                                        <option value="ONLY">Apenas</option>
                                    </select>
                                </div>
                                {qualityMode === 'UP_TO' && (
                                    <div className="space-y-1">
                                        <Label className="text-xs">Qualidade máxima</Label>
                                        <select value={qualityMax} onChange={e => setQualityMax(Number(e.target.value))}
                                            className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400">
                                            {QUALITY_LADDER.map(h => <option key={h} value={h}>{h}p</option>)}
                                        </select>
                                    </div>
                                )}
                                {qualityMode === 'BETWEEN' && (<>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Mínimo</Label>
                                        <select value={qualityMin} onChange={e => setQualityMin(Number(e.target.value))}
                                            className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400">
                                            {QUALITY_LADDER.filter(h => h < qualityMax).map(h => <option key={h} value={h}>{h}p</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Máximo</Label>
                                        <select value={qualityMax} onChange={e => setQualityMax(Number(e.target.value))}
                                            className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400">
                                            {QUALITY_LADDER.filter(h => h > qualityMin).map(h => <option key={h} value={h}>{h}p</option>)}
                                        </select>
                                    </div>
                                </>)}
                                {qualityMode === 'ONLY' && (
                                    <div className="col-span-2 space-y-1">
                                        <Label className="text-xs">Resoluções permitidas</Label>
                                        <div className="flex gap-2">
                                            {QUALITY_LADDER.map(h => (
                                                <button key={h} type="button" onClick={() => toggleOnly(h)}
                                                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                                        qualityOnly.includes(h)
                                                            ? 'bg-purple-600 text-white border-purple-600'
                                                            : 'bg-white text-gray-500 border-gray-300 hover:border-purple-400'
                                                    }`}>{h}p</button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-purple-600">
                                Streams gerados: <strong>{effectiveHeights.length > 0 ? effectiveHeights.map(h => `${h}p`).join(' + ') : 'nenhum selecionado'}</strong>
                            </p>
                        </div>

                        {/* Créditos */}
                        <div className="grid grid-cols-2 gap-4 bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                            <div className="col-span-2 flex items-center gap-2">
                                <Coins className="w-4 h-4 text-yellow-600" />
                                <p className="text-sm font-semibold text-yellow-800">Créditos do Plano</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Créditos por Período</Label>
                                <Input type="number" min={0} placeholder="Ex: 500 (vazio = sem créditos)" value={formData.creditsPerPeriod} onChange={e => setFormData({ ...formData, creditsPerPeriod: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Período de Reset</Label>
                                <select value={formData.creditResetPeriod} onChange={e => setFormData({ ...formData, creditResetPeriod: e.target.value })}
                                    className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400">
                                    <option value="monthly">Mensal</option>
                                    <option value="weekly">Semanal</option>
                                    <option value="yearly">Anual</option>
                                </select>
                            </div>
                        </div>

                        {/* Permissões */}
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Switch id="flexible-dist" checked={formData.allowFlexibleDistribution} onCheckedChange={c => setFormData({ ...formData, allowFlexibleDistribution: c })} />
                                <div>
                                    <Label htmlFor="flexible-dist">Pool Flexível de Lista de Treinos</Label>
                                    <p className="text-xs text-gray-400">O limite mensal é compartilhado entre todos os alunos. O treinador distribui os planos livremente, sem restrição individual por aluno.</p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch id="hourly-rate" checked={formData.allowHourlyRate} onCheckedChange={c => setFormData({ ...formData, allowHourlyRate: c })} />
                                <div>
                                    <Label htmlFor="hourly-rate">Permitir Taxa de Serviço</Label>
                                    <p className="text-xs text-gray-400">Treinadores deste tier podem adicionar uma taxa extra às ofertas.</p>
                                </div>
                            </div>
                            {formData.allowHourlyRate && (
                                <div className="space-y-1 pl-10">
                                    <Label className="text-xs">Política de Comissão sobre a Taxa</Label>
                                    <select value={formData.hourlyRatePolicy} onChange={e => setFormData({ ...formData, hourlyRatePolicy: e.target.value })}
                                        className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                        <option value="base_only">Apenas sobre o preço base da assinatura (recomendado)</option>
                                        <option value="full">Sobre o total (base + taxa de serviço)</option>
                                    </select>
                                    <p className="text-xs text-gray-400">
                                        {formData.hourlyRatePolicy === 'base_only'
                                            ? 'Ex: taxa de serviço R$ 300 vai 100% ao treinador; plataforma retira % só dos R$ 99,90.'
                                            : 'Ex: plataforma retira % do total de R$ 399,90, incluindo a taxa de serviço.'}
                                    </p>
                                </div>
                            )}
                            <div className="flex items-center space-x-2">
                                <Switch id="tier-active" checked={formData.isActive} onCheckedChange={c => setFormData({ ...formData, isActive: c })} />
                                <Label htmlFor="tier-active">Tier Ativo para novos parceiros</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch id="tier-default" checked={formData.isDefault} onCheckedChange={c => setFormData({ ...formData, isDefault: c })} />
                                <div>
                                    <Label htmlFor="tier-default">Tier Padrão de Cadastro</Label>
                                    <p className="text-xs text-gray-400">Novos parceiros são automaticamente alocados neste tier. Só um pode ser padrão por vez.</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Descrição</Label>
                            <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} placeholder="Descrição das vantagens ou regras desse tier..." />
                        </div>
                    </form>
                </CardContent>
                <CardFooter className="flex justify-end gap-2 border-t pt-4">
                    <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button type="submit" form="partnerTierForm" className="bg-blue-600 hover:bg-blue-700" disabled={saving}>
                        {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        Salvar Tier
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}

// ─── TierFormModal ─────────────────────────────────────────────────────────────

const QUALITY_LADDER = [360, 480, 720, 1080]

function inferQualityMode(heights) {
    if (!heights || heights.length === 0) return { mode: 'UP_TO', max: 1080 }
    const sorted = [...heights].sort((a, b) => a - b)
    const min = sorted[0], max = sorted[sorted.length - 1]
    const fullRange = QUALITY_LADDER.filter(h => h >= min && h <= max)
    if (sorted.length === fullRange.length && sorted.every((h, i) => h === fullRange[i])) {
        return min === QUALITY_LADDER[0] ? { mode: 'UP_TO', max } : { mode: 'BETWEEN', min, max }
    }
    return { mode: 'ONLY', list: sorted }
}

function qualityModeToHeights(mode, min, max, list) {
    if (mode === 'UP_TO') return QUALITY_LADDER.filter(h => h <= max)
    if (mode === 'BETWEEN') return QUALITY_LADDER.filter(h => h >= min && h <= max)
    return [...list].sort((a, b) => a - b)
}

function TierFormModal({ tier, onClose, onSuccess }) {
    const initialQuality = inferQualityMode(tier?.videoQualityHeights)

    const [formData, setFormData] = useState({
        name: tier?.name || '',
        price: tier?.price || 0,
        stripePriceId: tier?.stripePriceId || '',
        description: tier?.description || '',
        features: tier?.features ? tier.features.join('\n') : '',
        maxAthletes: tier?.maxAthletes || 3,
        maxPlansPerMonth: tier?.maxPlansPerMonth || 10,
        targetRole: tier?.targetRole || ROLES.PROFESSIONAL,
        isPopular: tier ? tier.isPopular : false,
        isActive: tier ? tier.isActive : true,
        creditsPerPeriod: tier?.creditsPerPeriod ?? '',
        creditResetPeriod: tier?.creditResetPeriod || 'monthly',
    })

    const [qualityMode, setQualityMode] = useState(initialQuality.mode)
    const [qualityMax, setQualityMax] = useState(initialQuality.max || 1080)
    const [qualityMin, setQualityMin] = useState(initialQuality.min || 480)
    const [qualityOnly, setQualityOnly] = useState(initialQuality.list || [720, 1080])
    const [saving, setSaving] = useState(false)

    const toggleOnly = (h) => setQualityOnly(prev =>
        prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h].sort((a, b) => a - b)
    )

    const effectiveHeights = qualityModeToHeights(qualityMode, qualityMin, qualityMax, qualityOnly)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        const featuresArray = formData.features.split('\n').map(f => f.trim()).filter(f => f.length > 0)
        const payload = {
            ...formData,
            features: featuresArray,
            maxAthletes: formData.targetRole === ROLES.INDIVIDUAL ? 0 : Number(formData.maxAthletes),
            maxPlansPerMonth: Number(formData.maxPlansPerMonth),
            creditsPerPeriod: formData.creditsPerPeriod !== '' ? parseInt(formData.creditsPerPeriod) : null,
            videoQualityHeights: effectiveHeights,
        }
        try {
            const url = tier ? `/api/backend/admin/tiers/${tier.id}` : '/api/backend/admin/tiers'
            const method = tier ? 'PUT' : 'POST'
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            if (!res.ok) throw new Error('Erro ao salvar o plano')
            toast.success(tier ? 'Plano atualizado!' : 'Plano criado!')
            onSuccess()
        } catch (err) {
            toast.error(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <Card className="w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
                <CardHeader className="pb-3">
                    <CardTitle>{tier ? 'Editar Plano de Assinatura' : 'Criar Novo Plano de Assinatura'}</CardTitle>
                    <CardDescription>Este plano será listado imediatamente na Landing Page e na Tela de Configurações</CardDescription>
                </CardHeader>
                <CardContent className="overflow-y-auto flex-1">
                    <form id="tierForm" onSubmit={handleSubmit} className="space-y-4">

                        {/* Identidade */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nome do Plano</Label>
                                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Premium" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Preço Mensal (R$)</Label>
                                <Input type="number" step="0.01" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} required />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Stripe Price ID <span className="text-gray-400 text-xs">(opcional)</span></Label>
                                <Input value={formData.stripePriceId} onChange={e => setFormData({ ...formData, stripePriceId: e.target.value })} placeholder="Auto-gerado se vazio" />
                            </div>
                            <div className="space-y-2">
                                <Label>Público Alvo (Role)</Label>
                                <Select value={formData.targetRole} onValueChange={(val) => setFormData({ ...formData, targetRole: val })}>
                                    <SelectTrigger><SelectValue placeholder="Selecione o público" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ROLES.PROFESSIONAL}>Apenas Treinadores</SelectItem>
                                        <SelectItem value={ROLES.INDIVIDUAL}>Apenas Atletas</SelectItem>
                                        <SelectItem value="BOTH">Universal (Ambos)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Descrição Curta</Label>
                            <Input value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Ideal para treinadores de alto rendimento..." required />
                        </div>

                        {/* Limites */}
                        <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border">
                            {formData.targetRole !== ROLES.INDIVIDUAL && (
                                <div className="space-y-2">
                                    <Label>Limite de Atletas</Label>
                                    <Input type="number" value={formData.maxAthletes} onChange={e => setFormData({ ...formData, maxAthletes: e.target.value })} required={formData.targetRole !== ROLES.INDIVIDUAL} disabled={Number(formData.maxAthletes) > 900} />
                                    <div className="flex items-center space-x-2 pt-1">
                                        <Switch id="unlAth" checked={Number(formData.maxAthletes) > 900} onCheckedChange={c => setFormData({ ...formData, maxAthletes: c ? 9999 : 3 })} />
                                        <Label htmlFor="unlAth" className="text-xs text-gray-600 cursor-pointer">Ilimitado</Label>
                                    </div>
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label>Limite Planos/Mês</Label>
                                <Input type="number" value={formData.maxPlansPerMonth} onChange={e => setFormData({ ...formData, maxPlansPerMonth: e.target.value })} required disabled={Number(formData.maxPlansPerMonth) > 900} />
                                <div className="flex items-center space-x-2 pt-1">
                                    <Switch id="unlPlans" checked={Number(formData.maxPlansPerMonth) > 900} onCheckedChange={c => setFormData({ ...formData, maxPlansPerMonth: c ? 9999 : 10 })} />
                                    <Label htmlFor="unlPlans" className="text-xs text-gray-600 cursor-pointer">Ilimitado</Label>
                                </div>
                            </div>
                        </div>

                        {/* Qualidade de Vídeo */}
                        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 space-y-3">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-purple-800">🎬 Qualidade de Vídeo</p>
                                <p className="text-xs text-purple-500">(nunca upscala além da resolução original)</p>
                            </div>
                            <div className="grid grid-cols-3 gap-3 items-end">
                                <div className="space-y-1">
                                    <Label className="text-xs">Modo</Label>
                                    <select value={qualityMode} onChange={e => setQualityMode(e.target.value)}
                                        className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400">
                                        <option value="UP_TO">Até</option>
                                        <option value="BETWEEN">Entre</option>
                                        <option value="ONLY">Apenas</option>
                                    </select>
                                </div>
                                {qualityMode === 'UP_TO' && (
                                    <div className="space-y-1">
                                        <Label className="text-xs">Qualidade máxima</Label>
                                        <select value={qualityMax} onChange={e => setQualityMax(Number(e.target.value))}
                                            className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400">
                                            {QUALITY_LADDER.map(h => <option key={h} value={h}>{h}p</option>)}
                                        </select>
                                    </div>
                                )}
                                {qualityMode === 'BETWEEN' && (<>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Mínimo</Label>
                                        <select value={qualityMin} onChange={e => setQualityMin(Number(e.target.value))}
                                            className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400">
                                            {QUALITY_LADDER.filter(h => h < qualityMax).map(h => <option key={h} value={h}>{h}p</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Máximo</Label>
                                        <select value={qualityMax} onChange={e => setQualityMax(Number(e.target.value))}
                                            className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400">
                                            {QUALITY_LADDER.filter(h => h > qualityMin).map(h => <option key={h} value={h}>{h}p</option>)}
                                        </select>
                                    </div>
                                </>)}
                                {qualityMode === 'ONLY' && (
                                    <div className="col-span-2 space-y-1">
                                        <Label className="text-xs">Resoluções permitidas</Label>
                                        <div className="flex gap-2">
                                            {QUALITY_LADDER.map(h => (
                                                <button key={h} type="button" onClick={() => toggleOnly(h)}
                                                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                                        qualityOnly.includes(h)
                                                            ? 'bg-purple-600 text-white border-purple-600'
                                                            : 'bg-white text-gray-500 border-gray-300 hover:border-purple-400'
                                                    }`}>{h}p</button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-purple-600">
                                Streams gerados: <strong>{effectiveHeights.length > 0 ? effectiveHeights.map(h => `${h}p`).join(' + ') : 'nenhum selecionado'}</strong>
                            </p>
                        </div>

                        {/* Créditos */}
                        <div className="grid grid-cols-2 gap-4 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                            <div className="col-span-2 flex items-center gap-2 mb-1">
                                <Coins className="w-4 h-4 text-yellow-600" />
                                <p className="text-sm font-semibold text-yellow-800">Créditos do Plano</p>
                                <p className="text-xs text-yellow-600">(vazio = sem créditos)</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Créditos por Período</Label>
                                <Input type="number" min={0} placeholder="Ex: 1000" value={formData.creditsPerPeriod} onChange={e => setFormData({ ...formData, creditsPerPeriod: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Período de Reset</Label>
                                <select value={formData.creditResetPeriod} onChange={e => setFormData({ ...formData, creditResetPeriod: e.target.value })}
                                    className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400">
                                    <option value="monthly">Mensal</option>
                                    <option value="weekly">Semanal</option>
                                    <option value="yearly">Anual</option>
                                </select>
                            </div>
                        </div>

                        {/* Benefícios */}
                        <div className="space-y-2">
                            <Label>Benefícios Exibidos <span className="text-xs text-gray-400">(um por linha)</span></Label>
                            <Textarea value={formData.features} onChange={e => setFormData({ ...formData, features: e.target.value })}
                                placeholder={"Planos ilimitados\nAtletas Ilimitados\nGeração com IA..."}
                                rows={3} required />
                        </div>

                        <div className="flex gap-6 pt-2">
                            <div className="flex items-center space-x-2">
                                <Switch id="pop" checked={formData.isPopular} onCheckedChange={c => setFormData({ ...formData, isPopular: c })} />
                                <Label htmlFor="pop">Mais Popular</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch id="act" checked={formData.isActive} onCheckedChange={c => setFormData({ ...formData, isActive: c })} />
                                <Label htmlFor="act">Plano Ativo</Label>
                            </div>
                        </div>
                    </form>
                </CardContent>
                <CardFooter className="flex justify-end gap-2 border-t pt-4">
                    <Button variant="outline" type="button" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button type="submit" form="tierForm" className="bg-green-600 hover:bg-green-700" disabled={saving}>
                        {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        {tier ? 'Salvar Alterações' : 'Criar Plano'}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
