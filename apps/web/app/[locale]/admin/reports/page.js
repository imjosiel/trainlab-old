'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Loader2, Plus, Download, CheckCircle, FileText, Trash2, RefreshCw, Settings, TrendingDown, TrendingUp, DollarSign, Users, ChevronDown, ChevronUp, Cloud, HardDrive, Wifi, Film, Image, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

const CATEGORY_OPTIONS = [
    { value: 'api_llm', label: 'Tokens API / LLM' },
    { value: 'storage', label: 'Armazenamento de Vídeos' },
    { value: 'accounting', label: 'Escritório de Contabilidade' },
    { value: 'freelancer', label: 'Freelancer' },
    { value: 'ads_spend', label: 'Investimento em Tráfego' },
    { value: 'ads_agency', label: 'Agência de Tráfego' },
    { value: 'other', label: 'Outros' },
]

const fmt = (v) => `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',')}`
const pct = (v) => `${(parseFloat(v || 0) * 100).toFixed(2).replace('.', ',')}%`

function StatusBadge({ status }) {
    return status === 'published'
        ? <Badge className="bg-green-100 text-green-700 border-green-200">✓ Publicado</Badge>
        : <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Rascunho</Badge>
}

// ─── Report Detail Modal ──────────────────────────────────────────────────────
function ReportModal({ report: initial, onClose, onUpdate }) {
    const [report, setReport] = useState(initial)
    const [expenses, setExpenses] = useState(initial?.expenses ?? [])
    const [newExpense, setNewExpense] = useState({ category: 'other', description: '', amount: '' })
    const [saving, setSaving] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const published = report?.status === 'published'

    const saveExpenses = async (list) => {
        setSaving(true)
        try {
            const res = await fetch(`/api/backend/admin/reports/${report.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expenses: list })
            })
            const data = await res.json()
            if (res.ok) {
                setReport(data.report)
                setExpenses(data.report.expenses)
                onUpdate(data.report)
                toast.success('Despesas salvas')
            } else toast.error(data.error)
        } finally { setSaving(false) }
    }

    const addExpense = () => {
        if (!newExpense.description || !newExpense.amount) return
        const updated = [...expenses, { ...newExpense, amount: parseFloat(newExpense.amount) }]
        setExpenses(updated)
        setNewExpense({ category: 'other', description: '', amount: '' })
        saveExpenses(updated)
    }

    const removeExpense = (idx) => {
        const updated = expenses.filter((_, i) => i !== idx)
        setExpenses(updated)
        saveExpenses(updated)
    }

    const publish = async () => {
        setPublishing(true)
        try {
            const res = await fetch(`/api/backend/admin/reports/${report.id}/publish`, { method: 'POST' })
            const data = await res.json()
            if (res.ok) { setReport(data.report); onUpdate(data.report); toast.success('Relatório publicado!') }
            else toast.error(data.error)
        } finally { setPublishing(false) }
    }

    const exportCsv = () => {
        window.open(`/api/backend/admin/reports/${report.id}/export`, '_blank')
    }

    if (!report) return null

    const autoExpenses = (report.stripeFeePercent || 0) + (report.stripeFeeFixed || 0) + (report.partnerCommissions || 0)

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Relatório {report.period} <StatusBadge status={report.status} />
                    </DialogTitle>
                    <DialogDescription>
                        {report.activeSubscriptions} assinantes ativos · Gerado {new Date(report.generatedAt).toLocaleDateString('pt-BR')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-1 px-1">
                    {/* Receita */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                            <p className="text-xs text-blue-600 font-medium flex items-center gap-1"><Users className="w-3 h-3"/>Assinantes</p>
                            <p className="text-2xl font-bold text-blue-800">{report.activeSubscriptions}</p>
                        </div>
                        <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                            <p className="text-xs text-green-600 font-medium flex items-center gap-1"><TrendingUp className="w-3 h-3"/>Receita Bruta</p>
                            <p className="text-2xl font-bold text-green-800">{fmt(report.grossRevenue)}</p>
                        </div>
                    </div>

                    {/* Saídas automáticas */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                            <TrendingDown className="w-4 h-4 text-red-500"/> Saídas calculadas
                        </h4>
                        <div className="border rounded-md overflow-hidden text-sm">
                            <table className="w-full">
                                <tbody className="divide-y">
                                    <tr className="bg-gray-50/50">
                                        <td className="px-3 py-2 text-gray-600">Taxa Stripe (% sobre receita)</td>
                                        <td className="px-3 py-2 text-right text-red-600 font-medium">− {fmt(report.stripeFeePercent)}</td>
                                    </tr>
                                    <tr>
                                        <td className="px-3 py-2 text-gray-600">Taxa Stripe (R$0,39 × {report.activeSubscriptions} alunos)</td>
                                        <td className="px-3 py-2 text-right text-red-600 font-medium">− {fmt(report.stripeFeeFixed)}</td>
                                    </tr>
                                    <tr className="bg-gray-50/50">
                                        <td className="px-3 py-2 text-gray-600">Comissões de parceiros</td>
                                        <td className="px-3 py-2 text-right text-red-600 font-medium">− {fmt(report.partnerCommissions)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Despesas manuais */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Despesas operacionais (manuais)</h4>
                        {expenses.length > 0 && (
                            <div className="border rounded-md overflow-hidden text-sm mb-2">
                                <table className="w-full">
                                    <tbody className="divide-y">
                                        {expenses.map((e, i) => (
                                            <tr key={i}>
                                                <td className="px-3 py-2 text-gray-500 text-xs">{CATEGORY_OPTIONS.find(c => c.value === e.category)?.label || e.category}</td>
                                                <td className="px-3 py-2 text-gray-700">{e.description}</td>
                                                <td className="px-3 py-2 text-right text-red-600 font-medium">− {fmt(e.amount)}</td>
                                                {!published && (
                                                    <td className="px-2 py-1">
                                                        <button onClick={() => removeExpense(i)} className="text-gray-300 hover:text-red-400">
                                                            <Trash2 className="w-3.5 h-3.5"/>
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {!published && (
                            <div className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-end">
                                <div>
                                    <Label className="text-xs">Categoria</Label>
                                    <select
                                        value={newExpense.category}
                                        onChange={e => setNewExpense(p => ({ ...p, category: e.target.value }))}
                                        className="w-full border rounded px-2 py-1.5 text-xs bg-white"
                                    >
                                        {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-xs">Descrição</Label>
                                    <Input className="h-8 text-xs" value={newExpense.description} onChange={e => setNewExpense(p => ({ ...p, description: e.target.value }))} placeholder="Ex: GPT-4o API"/>
                                </div>
                                <div>
                                    <Label className="text-xs">Valor (R$)</Label>
                                    <Input className="h-8 text-xs w-24" type="number" step="0.01" value={newExpense.amount} onChange={e => setNewExpense(p => ({ ...p, amount: e.target.value }))} placeholder="0,00"/>
                                </div>
                                <Button size="sm" className="h-8 mt-5" onClick={addExpense} disabled={saving}>
                                    {saving ? <Loader2 className="w-3 h-3 animate-spin"/> : <Plus className="w-3 h-3"/>}
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Totais */}
                    <div className="border-t pt-3 space-y-1 text-sm">
                        <div className="flex justify-between text-gray-500">
                            <span>Total Saídas</span>
                            <span className="text-red-600 font-medium">− {fmt(report.totalExpenses)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-base mt-1">
                            <span className="flex items-center gap-1"><DollarSign className="w-4 h-4 text-green-600"/>Resultado Líquido</span>
                            <span className={report.netRevenue >= 0 ? 'text-green-700' : 'text-red-700'}>{fmt(report.netRevenue)}</span>
                        </div>
                    </div>

                    {/* Distribuição */}
                    {report.distributions?.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">📊 Distribuição do Resultado</h4>
                            <div className="grid grid-cols-3 gap-2">
                                {report.distributions.map((d, i) => (
                                    <div key={i} className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-center">
                                        <p className="text-xs text-purple-600 font-medium">{d.label}</p>
                                        <p className="text-lg font-bold text-purple-800">{fmt(d.amount)}</p>
                                        <p className="text-xs text-purple-500">{pct(d.percentage)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t pt-3 gap-2 flex-wrap">
                    <Button variant="outline" onClick={onClose}>Fechar</Button>
                    <Button variant="outline" className="gap-1" onClick={exportCsv}>
                        <Download className="w-4 h-4"/> Exportar CSV
                    </Button>
                    {!published && (
                        <Button className="bg-green-600 hover:bg-green-700 gap-1" onClick={publish} disabled={publishing}>
                            {publishing ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
                            Publicar
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Finance Settings Panel ───────────────────────────────────────────────────
function FinanceSettingsPanel() {
    const [settings, setSettings] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [open, setOpen] = useState(true)
    const [rules, setRules] = useState([])

    useEffect(() => {
        fetch('/api/backend/admin/platform-finance-settings')
            .then(r => r.json())
            .then(d => {
                const s = d.settings ?? {
                    stripePercentFee: 0.0399,
                    stripeFixedFeeInCents: 39,
                    usdToBrlRate: 5.85,
                    distributionRules: [
                        { label: 'Caixa da Empresa', percentage: 0.40 },
                        { label: 'Distribuição — Você', percentage: 0.30 },
                        { label: 'Distribuição — Sócio', percentage: 0.30 },
                    ],
                }
                setSettings(s)
                setRules(s.distributionRules ?? [])
            })
            .finally(() => setLoading(false))
    }, [])

    const totalPct = rules.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0)

    const save = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/backend/admin/platform-finance-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stripePercentFee: parseFloat(settings.stripePercentFeeInput ?? settings.stripePercentFee),
                    stripeFixedFeeInCents: parseInt(settings.stripeFixedFeeInCents),
                    usdToBrlRate: parseFloat(settings.usdToBrlRate ?? 5.85),
                    distributionRules: rules.map(r => ({ label: r.label, percentage: parseFloat(r.percentage) }))
                })
            })
            const data = await res.json()
            if (res.ok) { setSettings(data.settings); setRules(data.settings.distributionRules); toast.success('Configurações salvas') }
            else toast.error(data.error)
        } finally { setSaving(false) }
    }

    if (loading) return <Card className="mt-6"><CardContent className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400"/></CardContent></Card>

    return (
        <Card className="mt-6">
            <CardHeader className="cursor-pointer pb-3" onClick={() => setOpen(o => !o)}>
                <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2"><Settings className="w-4 h-4"/> Configurações Financeiras</span>
                    {open ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                </CardTitle>
            </CardHeader>
            {open && settings && (
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-xs">Stripe — Taxa % por transação</Label>
                            <Input
                                type="number" step="0.01" min={0} max={10}
                                value={(settings.stripePercentFeeInput ?? (settings.stripePercentFee * 100).toFixed(2))}
                                onChange={e => setSettings(s => ({ ...s, stripePercentFeeInput: e.target.value, stripePercentFee: parseFloat(e.target.value) / 100 }))}
                            />
                            <p className="text-xs text-gray-400">Ex: 3.99 para 3.99%</p>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Stripe — Taxa fixa (centavos)</Label>
                            <Input
                                type="number" min={0}
                                value={settings.stripeFixedFeeInCents}
                                onChange={e => setSettings(s => ({ ...s, stripeFixedFeeInCents: e.target.value }))}
                            />
                            <p className="text-xs text-gray-400">Ex: 39 para R$0,39</p>
                        </div>
                    </div>

                    {/* Taxa de câmbio USD → BRL */}
                    <div className="space-y-1">
                        <Label className="text-xs">Câmbio USD → BRL (para serviços externos)</Label>
                        <Input
                            type="number" step="0.01" min={1}
                            value={settings.usdToBrlRate ?? 5.85}
                            onChange={e => setSettings(s => ({ ...s, usdToBrlRate: e.target.value }))}
                        />
                        <p className="text-xs text-gray-400">Converte custos externos (ex: Cloudinary) de USD para R$ nos relatórios</p>
                    </div>

                    <div>
                        <Label className="text-xs mb-2 block">Distribuição do Lucro Líquido</Label>
                        <div className="space-y-2">
                            {rules.map((rule, i) => (
                                <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                                    <Input
                                        className="text-sm"
                                        value={rule.label}
                                        onChange={e => setRules(rs => rs.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
                                        placeholder="Label"
                                    />
                                    <div className="flex items-center gap-1">
                                        <Input
                                            type="number" step="1" min={0} max={100}
                                            className="w-20 text-sm"
                                            value={(parseFloat(rule.percentage) * 100).toFixed(0)}
                                            onChange={e => setRules(rs => rs.map((r, j) => j === i ? { ...r, percentage: parseFloat(e.target.value) / 100 } : r))}
                                        />
                                        <span className="text-sm text-gray-500">%</span>
                                    </div>
                                    <button onClick={() => setRules(rs => rs.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400">
                                        <Trash2 className="w-4 h-4"/>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                            <button
                                onClick={() => setRules(rs => [...rs, { label: '', percentage: 0 }])}
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3"/> Adicionar
                            </button>
                            <span className={`text-xs font-medium ${Math.abs(totalPct - 1.0) < 0.001 ? 'text-green-600' : 'text-red-500'}`}>
                                Total: {(totalPct * 100).toFixed(1)}%{Math.abs(totalPct - 1.0) > 0.001 ? ' (deve ser 100%)' : ' ✓'}
                            </span>
                        </div>
                    </div>

                    <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 w-full">
                        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin"/>} Salvar Configurações
                    </Button>
                </CardContent>
            )}
        </Card>
    )
}

// ─── Cloudinary Usage Panel ───────────────────────────────────────────────────
function UsageBar({ used, limit, pctOverride, color = 'blue' }) {
    const pctNum = pctOverride != null
        ? Math.min(100, pctOverride)
        : limit > 0 ? Math.min(100, (used / limit) * 100) : 0
    const danger = pctNum > 80
    const warning = pctNum > 60
    const barColor = danger ? 'bg-red-500' : warning ? 'bg-yellow-500' : `bg-${color}-500`
    return (
        <div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${pctNum}%` }} />
            </div>
            <p className={`text-xs mt-0.5 ${danger ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {pctNum.toFixed(1)}% utilizado
            </p>
        </div>
    )
}

function CloudinaryUsagePanel() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [open, setOpen] = useState(true)

    const fetchUsage = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/backend/admin/cloudinary-usage')
            const json = await res.json()
            if (res.ok) setData(json)
            else setError(json.error)
        } catch { setError('Falha ao conectar com a API do Cloudinary.') }
        finally { setLoading(false) }
    }

    useEffect(() => { fetchUsage() }, [])

    const usdFmt = (v) => `$${parseFloat(v || 0).toFixed(2)}`

    return (
        <Card className="mt-6">
            <CardHeader className="cursor-pointer pb-3" onClick={() => setOpen(o => !o)}>
                <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <Cloud className="w-4 h-4 text-indigo-500"/> Cloudinary — Uso atual
                        {data && <span className="text-xs font-normal text-gray-400 ml-1">plano: {data.plan || 'Free'}</span>}
                    </span>
                    <div className="flex items-center gap-2">
                        {!loading && (
                            <button onClick={e => { e.stopPropagation(); fetchUsage() }} className="text-gray-400 hover:text-blue-500">
                                <RotateCcw className="w-3.5 h-3.5"/>
                            </button>
                        )}
                        {open ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                    </div>
                </CardTitle>
            </CardHeader>

            {open && (
                <CardContent>
                    {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-400"/></div>}
                    {error && <p className="text-sm text-red-500 text-center py-4">{error}</p>}
                    {data && !loading && (
                        <div className="space-y-5">

                            {/* Pool unificado de créditos — barra empilhada */}
                            <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                    Pool de Créditos — uso compartilhado
                                </h4>
                                <p className="text-xs text-gray-400 mb-3">
                                    Os 25 créditos do plano Free são um pool único. Cada GB de storage, GB de bandwidth ou 1K transformações consome 1 crédito do mesmo bolo.
                                </p>

                                {/* Barra empilhada */}
                                {(() => {
                                    const b = data.credits?.breakdown || {}
                                    const total = data.credits?.limit || 25
                                    const used = data.credits?.used || 0
                                    const segments = [
                                        { key: 'storage',         label: 'Storage',       value: b.storage || 0,         color: 'bg-blue-500' },
                                        { key: 'bandwidth',       label: 'Bandwidth',     value: b.bandwidth || 0,       color: 'bg-green-500' },
                                        { key: 'transformations', label: 'Transformações', value: b.transformations || 0, color: 'bg-purple-500' },
                                        { key: 'video',           label: 'Vídeo',         value: b.video || 0,           color: 'bg-orange-500' },
                                    ]
                                    const freePct = Math.max(0, ((total - used) / total) * 100)
                                    return (
                                        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 space-y-3">
                                            {/* Barra empilhada */}
                                            <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden flex">
                                                {segments.map(seg => {
                                                    const pct = total > 0 ? (seg.value / total) * 100 : 0
                                                    if (pct < 0.01) return null
                                                    return (
                                                        <div
                                                            key={seg.key}
                                                            className={`${seg.color} h-full transition-all`}
                                                            style={{ width: `${pct}%` }}
                                                            title={`${seg.label}: ${seg.value.toFixed(3)} cr`}
                                                        />
                                                    )
                                                })}
                                                {/* Livre */}
                                                <div className="bg-gray-100 h-full flex-1" title={`Livre: ${(total - used).toFixed(2)} cr`}/>
                                            </div>

                                            {/* Legenda */}
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                                {segments.map(seg => (
                                                    <span key={seg.key} className="flex items-center gap-1.5 text-xs text-gray-600">
                                                        <span className={`w-2.5 h-2.5 rounded-sm ${seg.color}`}/>
                                                        {seg.label} — <strong>{seg.value.toFixed(3)} cr</strong>
                                                    </span>
                                                ))}
                                                <span className="flex items-center gap-1.5 text-xs text-gray-400 ml-auto">
                                                    Livre — <strong>{Math.max(0, total - used).toFixed(2)} cr</strong>
                                                </span>
                                            </div>

                                            {/* Totais */}
                                            <div className="flex justify-between items-center pt-1 border-t border-indigo-200">
                                                <span className="text-sm font-semibold text-indigo-700">
                                                    {used.toFixed(2)} / {total} créditos utilizados ({((used / total) * 100).toFixed(1)}%)
                                                </span>
                                                {data.estimatedCostUSD > 0
                                                    ? <span className="text-sm font-bold text-red-600">${data.estimatedCostUSD.toFixed(2)} de overage</span>
                                                    : <span className="text-xs text-green-600 font-medium">✓ Dentro do plano gratuito</span>
                                                }
                                            </div>
                                        </div>
                                    )
                                })()}

                                {/* Análise de tendência — discreta, baseada em dados históricos */}
                                {(() => {
                                    const history = data.usageHistory || []
                                    if (history.length < 2) return null // precisa de ao menos 2 meses

                                    const limit = data.credits?.limit || 25
                                    const avg = history.reduce((s, h) => s + h.creditsUsed, 0) / history.length
                                    const monthsToLimit = avg > 0 ? (limit / avg) : Infinity

                                    // Maior consumidor médio
                                    const bAvg = { storage: 0, bandwidth: 0, transformations: 0, video: 0 }
                                    history.forEach(h => {
                                        const b = h.breakdown || {}
                                        bAvg.storage += b.storage || 0
                                        bAvg.bandwidth += b.bandwidth || 0
                                        bAvg.transformations += b.transformations || 0
                                        bAvg.video += b.video || 0
                                    })
                                    const topKey = Object.entries(bAvg).sort((a, b) => b[1] - a[1])[0][0]
                                    const topLabels = { storage: 'Storage', bandwidth: 'Bandwidth', transformations: 'Transformações', video: 'Vídeo' }

                                    const PLANS = [
                                        { name: 'Free',       credits: 25,   price: null },
                                        { name: 'Small PAYG', credits: 60,   price: '$29/mês' },
                                        { name: 'Plus',       credits: 225,  price: '$99/mês' },
                                        { name: 'Advanced',   credits: 600,  price: '$249/mês' },
                                    ]
                                    const recommended = PLANS.find(p => p.credits > avg * 1.4) // 40% de folga
                                    const needUpgrade = recommended && recommended.credits > limit

                                    const monthsLabel = history.length === 1 ? '1 mês' : `${history.length} meses`
                                    const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

                                    return (
                                        <div className="mt-3 pt-3 border-t border-gray-100">
                                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                                {/* Resumo da tendência */}
                                                <p className="text-xs text-gray-500">
                                                    <span className="font-medium text-gray-700">Tendência ({monthsLabel}):</span>{' '}
                                                    média de <strong>{avg.toFixed(2)} cr/mês</strong> — principal consumidor: <strong>{topLabels[topKey]}</strong>.
                                                    {monthsToLimit < 3
                                                        ? <span className="text-orange-600 ml-1">Nesse ritmo, o pool esgota em ~{monthsToLimit.toFixed(1)} meses.</span>
                                                        : <span className="text-green-600 ml-1">Plano atual confortável.</span>
                                                    }
                                                </p>
                                                {/* Recomendação de upgrade (só quando faz sentido) */}
                                                {needUpgrade && (
                                                    <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 rounded px-2 py-0.5 whitespace-nowrap">
                                                        Considerar: <strong>{recommended.name}</strong> ({recommended.credits} cr — {recommended.price})
                                                    </span>
                                                )}
                                            </div>
                                            {/* Mini histórico */}
                                            <div className="flex gap-3 mt-2">
                                                {[...history].reverse().map(h => (
                                                    <div key={`${h.year}-${h.month}`} className="text-center">
                                                        <div className="text-xs text-gray-400">{MONTH_NAMES[h.month-1]}</div>
                                                        <div className="text-xs font-semibold text-gray-700">{h.creditsUsed.toFixed(2)}</div>
                                                        <div className="text-xs text-gray-400">cr</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })()}
                            </div>

                            {/* Detalhes por recurso — informativo, sem barras de limite enganosas */}
                            <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Uso por recurso</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Storage', sub: `${data.storage?.usedGB} GB`, cr: data.credits?.breakdown?.storage, icon: HardDrive, color: 'blue', bg: 'bg-blue-50 border-blue-100' },
                                        { label: 'Bandwidth', sub: `${data.bandwidth?.usedGB} GB`, cr: data.credits?.breakdown?.bandwidth, icon: Wifi, color: 'green', bg: 'bg-green-50 border-green-100' },
                                        { label: 'Transformações', sub: `${(data.transformations?.used || 0).toLocaleString('pt-BR')} ops`, cr: data.credits?.breakdown?.transformations, icon: Image, color: 'purple', bg: 'bg-purple-50 border-purple-100' },
                                        { label: 'Vídeo', sub: `${data.videoProcessing?.usedMinutes} min`, cr: data.credits?.breakdown?.video, icon: Film, color: 'orange', bg: 'bg-orange-50 border-orange-100' },
                                    ].map(({ label, sub, cr, icon: Icon, color, bg }) => (
                                        <div key={label} className={`border rounded-lg p-3 ${bg}`}>
                                            <p className={`text-xs text-${color}-600 flex items-center gap-1 font-medium mb-1`}>
                                                <Icon className="w-3 h-3"/> {label}
                                            </p>
                                            <p className="text-sm font-bold text-gray-800">{sub}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{(cr || 0).toFixed(3)} créditos</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Assets + Requests */}
                            <div className="grid grid-cols-3 gap-3 text-center">
                                {[
                                    { label: 'Assets armazenados', value: (data.resources || 0).toLocaleString('pt-BR') },
                                    { label: 'Assets derivados', value: (data.derivedResources || 0).toLocaleString('pt-BR') },
                                    { label: 'Requisições API', value: (data.requests || 0).toLocaleString('pt-BR') },
                                ].map(({ label, value }) => (
                                    <div key={label} className="bg-gray-50 border rounded-lg p-3">
                                        <p className="text-xs text-gray-400">{label}</p>
                                        <p className="text-lg font-bold text-gray-700">{value}</p>
                                    </div>
                                ))}
                            </div>

                            {data.lastUpdated && (
                                <p className="text-xs text-gray-400 text-right">
                                    Última atualização: {new Date(data.lastUpdated).toLocaleString('pt-BR')}
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminReportsPage() {
    const [reports, setReports] = useState([])
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [selectedPeriod, setSelectedPeriod] = useState(() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    })
    const [detailReport, setDetailReport] = useState(null)

    const fetchReports = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/backend/admin/reports')
            const data = await res.json()
            if (res.ok) setReports(data.reports)
        } finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchReports() }, [fetchReports])

    const generate = async () => {
        setGenerating(true)
        try {
            const res = await fetch('/api/backend/admin/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ period: selectedPeriod })
            })
            const data = await res.json()
            if (res.ok) {
                toast.success(`Relatório ${selectedPeriod} gerado!`)
                fetchReports()
                setDetailReport(data.report)
            } else toast.error(data.error)
        } finally { setGenerating(false) }
    }

    const handleUpdate = (updated) => {
        setReports(rs => rs.map(r => r.id === updated.id ? updated : r))
    }

    const [year, month] = selectedPeriod.split('-').map(Number)
    const monthName = new Date(year, month - 1).toLocaleString('pt-BR', { month: 'long' })

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Relatórios Financeiros</h1>
                    <p className="text-sm text-gray-500 mt-1">Relatórios mensais com receita, taxas, comissões e distribuição de lucro</p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="month"
                        value={selectedPeriod}
                        onChange={e => setSelectedPeriod(e.target.value)}
                        className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button onClick={generate} disabled={generating} className="bg-blue-600 hover:bg-blue-700 gap-1">
                        {generating ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
                        Gerar {monthName}
                    </Button>
                </div>
            </div>

            {/* Lista de relatórios */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500"/>
                </div>
            ) : reports.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <FileText className="w-12 h-12 text-gray-200 mb-4"/>
                        <p className="text-gray-500 font-medium">Nenhum relatório gerado ainda</p>
                        <p className="text-sm text-gray-400 mt-1">Selecione o mês desejado e clique em "Gerar"</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {reports.map(report => {
                        const [y, m] = report.period.split('-').map(Number)
                        const name = new Date(y, m - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
                        return (
                            <Card key={report.id} className="hover:shadow-md transition-shadow">
                                <CardContent className="py-4">
                                    <div className="flex items-center justify-between flex-wrap gap-3">
                                        <div className="flex items-center gap-3">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-gray-800 capitalize">{name}</span>
                                                    <StatusBadge status={report.status}/>
                                                </div>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {report.activeSubscriptions} assinantes · Gerado {new Date(report.generatedAt).toLocaleDateString('pt-BR')}
                                                    {report.publishedAt && ` · Publicado ${new Date(report.publishedAt).toLocaleDateString('pt-BR')}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6 text-sm">
                                            <div className="text-right">
                                                <p className="text-xs text-gray-400">Receita Bruta</p>
                                                <p className="font-semibold text-green-700">{fmt(report.grossRevenue)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-gray-400">Total Saídas</p>
                                                <p className="font-semibold text-red-600">− {fmt(report.totalExpenses)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-gray-400">Resultado Líquido</p>
                                                <p className={`font-bold text-base ${report.netRevenue >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                    {fmt(report.netRevenue)}
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" className="gap-1 text-xs"
                                                    onClick={() => window.open(`/api/backend/admin/reports/${report.id}/export`, '_blank')}>
                                                    <Download className="w-3 h-3"/> CSV
                                                </Button>
                                                <Button size="sm" className="gap-1 text-xs bg-blue-600 hover:bg-blue-700"
                                                    onClick={() => setDetailReport(report)}>
                                                    <FileText className="w-3 h-3"/> Ver
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            <CloudinaryUsagePanel/>
            <FinanceSettingsPanel/>

            {detailReport && (
                <ReportModal
                    report={detailReport}
                    onClose={() => setDetailReport(null)}
                    onUpdate={(updated) => { handleUpdate(updated); setDetailReport(updated) }}
                />
            )}
        </div>
    )
}

