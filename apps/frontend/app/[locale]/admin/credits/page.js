'use client'

import { useState, useEffect } from 'react'
import { Coins, Save, Loader2, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Gift, History } from 'lucide-react'
import { toast } from 'sonner'

export default function AdminCreditsPage() {
    const [settings, setSettings] = useState(null)
    const [packages, setPackages] = useState([])
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Grant form
    const [grantEmail, setGrantEmail] = useState('')
    const [grantAmount, setGrantAmount] = useState('')
    const [grantNote, setGrantNote] = useState('')
    const [grantBucket, setGrantBucket] = useState('plan')
    const [granting, setGranting] = useState(false)

    // Package form
    const [pkgForm, setPkgForm] = useState({ name: '', credits: '', price: '', stripePriceId: '' })
    const [editingPkg, setEditingPkg] = useState(null)
    const [savingPkg, setSavingPkg] = useState(false)

    useEffect(() => { fetchAll() }, [])

    const fetchAll = async () => {
        setLoading(true)
        try {
            const [settRes, pkgRes, txRes] = await Promise.all([
                fetch('/api/backend/admin/settings').then(r => r.json()),
                fetch('/api/backend/admin/credits/packages').then(r => r.json()),
                fetch('/api/backend/admin/credits/transactions').then(r => r.json()),
            ])
            setSettings(settRes)
            setPackages(pkgRes.packages || [])
            setTransactions(txRes.transactions || [])
        } catch { toast.error('Erro ao carregar dados.') }
        finally { setLoading(false) }
    }

    const saveSettings = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/backend/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            })
            if (!res.ok) throw new Error()
            toast.success('Configurações salvas!')
        } catch { toast.error('Erro ao salvar.') }
        finally { setSaving(false) }
    }

    const handleGrant = async () => {
        if (!grantEmail || !grantAmount) return toast.error('E-mail e quantidade são obrigatórios.')
        setGranting(true)
        try {
            // Resolve userId by email first
            const userRes = await fetch(`/api/backend/admin/users/search?email=${encodeURIComponent(grantEmail)}`).then(r => r.json())
            if (!userRes.user?.id) return toast.error('Usuário não encontrado.')
            const res = await fetch('/api/backend/admin/credits/grant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userRes.user.id, amount: parseInt(grantAmount), description: grantNote, bucket: grantBucket }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            toast.success(`${grantAmount} créditos (${grantBucket}) concedidos! Total: ${data.newBalance}`)
            setGrantEmail(''); setGrantAmount(''); setGrantNote('')
            fetchAll()
        } catch (e) { toast.error(e.message || 'Erro ao conceder créditos.') }
        finally { setGranting(false) }
    }

    const savePkg = async () => {
        setSavingPkg(true)
        try {
            const url = editingPkg ? `/api/backend/admin/credits/packages/${editingPkg.id}` : '/api/backend/admin/credits/packages'
            const method = editingPkg ? 'PATCH' : 'POST'
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...pkgForm, credits: parseInt(pkgForm.credits), price: parseFloat(pkgForm.price) }),
            })
            if (!res.ok) throw new Error()
            toast.success(editingPkg ? 'Pacote atualizado!' : 'Pacote criado!')
            setPkgForm({ name: '', credits: '', price: '', stripePriceId: '' })
            setEditingPkg(null)
            fetchAll()
        } catch { toast.error('Erro ao salvar pacote.') }
        finally { setSavingPkg(false) }
    }

    const togglePkg = async (pkg) => {
        await fetch(`/api/backend/admin/credits/packages/${pkg.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: !pkg.isActive }),
        })
        fetchAll()
    }

    const deletePkg = async (id) => {
        if (!confirm('Excluir este pacote?')) return
        await fetch(`/api/backend/admin/credits/packages/${id}`, { method: 'DELETE' })
        fetchAll()
    }

    const editPkg = (pkg) => {
        setEditingPkg(pkg)
        setPkgForm({ name: pkg.name, credits: String(pkg.credits), price: String(pkg.price), stripePriceId: pkg.stripePriceId || '' })
    }

    const txTypeLabel = { GRANT: 'Concessão', SPEND: 'Gasto', RESET: 'Reset', PURCHASE: 'Compra', REFUND: 'Reembolso' }
    const txTypeColor = { GRANT: 'text-green-600', SPEND: 'text-red-500', RESET: 'text-blue-500', PURCHASE: 'text-purple-500', REFUND: 'text-orange-500' }

    if (loading) return (
        <div className="flex h-[400px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-green-500" />
        </div>
    )

    return (
        <div className="space-y-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Coins className="w-6 h-6 text-yellow-500" />
                        Sistema de Créditos
                    </h1>
                    <p className="text-slate-500 mt-1">Gerencie créditos, pacotes e custos por feature.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* ── 1. Toggle + Custos ────────────────────────── */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
                    <h2 className="text-lg font-semibold text-slate-800 border-b pb-3">Configurações Gerais</h2>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <div>
                            <p className="font-semibold text-slate-700">Ativar Sistema</p>
                            <p className="text-sm text-slate-500">Créditos obrigatórios para features de IA.</p>
                        </div>
                        <button onClick={() => setSettings(s => ({ ...s, enableCreditSystem: !s.enableCreditSystem }))} className="focus:outline-none">
                            {settings?.enableCreditSystem
                                ? <ToggleRight className="w-10 h-10 text-green-500" />
                                : <ToggleLeft className="w-10 h-10 text-slate-300" />}
                        </button>
                    </div>

                    <div className="space-y-3">
                        <p className="text-sm font-medium text-slate-700">Custo por Feature (créditos)</p>
                        {[
                            { key: 'creditCostPlanGen',  label: 'Gerar Plano de Treino (IA)' },
                            { key: 'creditCostAiVideo',  label: 'Gerar Vídeo IA (futuro)' },
                        ].map(f => (
                            <div key={f.key} className="flex items-center gap-3">
                                <label className="text-sm text-slate-600 flex-1">{f.label}</label>
                                <input
                                    type="number" min="0"
                                    value={settings?.[f.key] ?? ''}
                                    onChange={e => setSettings(s => ({ ...s, [f.key]: parseInt(e.target.value) || 0 }))}
                                    className="w-24 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-400"
                                />
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={saveSettings} disabled={saving}
                        className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Salvar Configurações
                    </button>
                </div>

                {/* ── 2. Concessão Manual ───────────────────────── */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                    <h2 className="text-lg font-semibold text-slate-800 border-b pb-3 flex items-center gap-2">
                        <Gift className="w-5 h-5 text-blue-500" />
                        Conceder Créditos
                    </h2>
                    <div className="space-y-3">
                        <input
                            placeholder="E-mail do treinador"
                            value={grantEmail}
                            onChange={e => setGrantEmail(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <input
                            type="number" placeholder="Quantidade de créditos"
                            value={grantAmount}
                            onChange={e => setGrantAmount(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <select
                            value={grantBucket}
                            onChange={e => setGrantBucket(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        >
                            <option value="plan">Bucket: Plano (reseta no ciclo)</option>
                            <option value="purchased">Bucket: Comprado (∞ permanente)</option>
                        </select>
                        <input
                            placeholder="Motivo (opcional)"
                            value={grantNote}
                            onChange={e => setGrantNote(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <button
                            onClick={handleGrant} disabled={granting}
                            className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50"
                        >
                            {granting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                            Conceder Créditos
                        </button>
                    </div>
                </div>

                {/* ── 3. Pacotes de Créditos ────────────────────── */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4 md:col-span-2">
                    <h2 className="text-lg font-semibold text-slate-800 border-b pb-3 flex items-center gap-2">
                        <Coins className="w-5 h-5 text-yellow-500" />
                        Pacotes de Créditos
                    </h2>

                    {/* Form */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <input
                            placeholder="Nome do pacote"
                            value={pkgForm.name}
                            onChange={e => setPkgForm(f => ({ ...f, name: e.target.value }))}
                            className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <input
                            type="number" placeholder="Créditos"
                            value={pkgForm.credits}
                            onChange={e => setPkgForm(f => ({ ...f, credits: e.target.value }))}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <input
                            type="number" placeholder="R$ Preço"
                            value={pkgForm.price}
                            onChange={e => setPkgForm(f => ({ ...f, price: e.target.value }))}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <input
                            placeholder="Stripe Price ID (opcional)"
                            value={pkgForm.stripePriceId}
                            onChange={e => setPkgForm(f => ({ ...f, stripePriceId: e.target.value }))}
                            className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <div className="col-span-2 flex gap-2">
                            <button
                                onClick={savePkg} disabled={savingPkg}
                                className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                                {savingPkg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                {editingPkg ? 'Atualizar' : 'Criar Pacote'}
                            </button>
                            {editingPkg && (
                                <button onClick={() => { setEditingPkg(null); setPkgForm({ name:'',credits:'',price:'',stripePriceId:'' }) }}
                                    className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                                    Cancelar
                                </button>
                            )}
                        </div>
                    </div>

                    {/* List */}
                    {packages.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">Nenhum pacote criado ainda.</p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {packages.map(pkg => (
                                <div key={pkg.id} className="flex items-center justify-between py-3">
                                    <div>
                                        <p className="font-medium text-slate-800">{pkg.name}</p>
                                        <p className="text-sm text-slate-500">
                                            {pkg.credits} créditos · R$ {pkg.price.toFixed(2)}
                                            {pkg.stripePriceId && <span className="ml-2 text-xs text-slate-400 font-mono">{pkg.stripePriceId}</span>}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pkg.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {pkg.isActive ? 'Ativo' : 'Inativo'}
                                        </span>
                                        <button onClick={() => togglePkg(pkg)} className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-700">
                                            {pkg.isActive ? <ToggleRight className="w-5 h-5 text-green-500"/> : <ToggleLeft className="w-5 h-5"/>}
                                        </button>
                                        <button onClick={() => editPkg(pkg)} className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => deletePkg(pkg.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── 4. Histórico Recente ──────────────────────── */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm md:col-span-2">
                    <h2 className="text-lg font-semibold text-slate-800 border-b pb-3 flex items-center gap-2">
                        <History className="w-5 h-5 text-slate-500" />
                        Histórico Recente
                    </h2>
                    {transactions.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">Nenhuma transação ainda.</p>
                    ) : (
                        <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                            {transactions.map(tx => (
                                <div key={tx.id} className="flex items-center justify-between py-3 text-sm">
                                    <div>
                                        <p className="font-medium text-slate-700">{tx.user?.name || tx.userId}</p>
                                        <p className="text-xs text-slate-400">{tx.description || tx.feature || '—'} · {new Date(tx.createdAt).toLocaleString('pt-BR')}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-semibold ${txTypeColor[tx.type] || 'text-slate-600'}`}>
                                            {tx.amount > 0 ? '+' : ''}{tx.amount}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {txTypeLabel[tx.type] || tx.type}
                                            {tx.bucket && <span className={`ml-1 px-1 py-0.5 rounded text-[10px] font-medium ${tx.bucket === 'purchased' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{tx.bucket}</span>}
                                            {' · saldo: '}{tx.balanceAfter}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    )
}
