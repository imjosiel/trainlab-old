'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
    Trophy,
    Plus,
    Search,
    Loader2,
    AlertCircle,
    CheckCircle2,
    Calendar,
    Activity,
    Edit2,
    Trash2,
    X,
    Lock
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"

export default function AdminSportsPage() {
    const [sports, setSports] = useState([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [search, setSearch] = useState('')
    const [formData, setFormData] = useState({ name: '', slug: '', positions: [] })
    const [positionInput, setPositionInput] = useState('')
    const [message, setMessage] = useState({ type: '', text: '' })

    // Modal Edit
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [editingSport, setEditingSport] = useState(null)
    const [editFormData, setEditFormData] = useState({ name: '', slug: '', positions: [], isActive: true })

    useEffect(() => {
        fetchSports()
    }, [])

    async function fetchSports() {
        try {
            const res = await fetch('/api/backend/admin/sports')
            if (res.ok) {
                const data = await res.json()
                setSports(data)
            }
        } catch (error) {
            console.error('Erro ao buscar esportes:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSyncDefaults() {
        if (!confirm('Isto irá sobrescrever as posições dos esportes padrão se eles já existirem. Deseja continuar?')) return
        setSyncing(true)
        setMessage({ type: '', text: '' })
        try {
            const res = await fetch('/api/backend/admin/sports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'syncDefaults' })
            })

            const data = await res.json()
            if (res.ok) {
                setMessage({ type: 'success', text: data.message })
                fetchSports()
            } else {
                setMessage({ type: 'error', text: data.error })
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Erro de conexão.' })
        } finally {
            setSyncing(false)
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        setSubmitting(true)
        setMessage({ type: '', text: '' })

        try {
            const res = await fetch('/api/backend/admin/sports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            const data = await res.json()

            if (res.ok) {
                setMessage({ type: 'success', text: 'Esporte adicionado com sucesso!' })
                setFormData({ name: '', slug: '', positions: [] })
                fetchSports()
            } else {
                setMessage({ type: 'error', text: data.error || 'Erro ao adicionar esporte.' })
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Erro de conexão com o servidor.' })
        } finally {
            setSubmitting(false)
        }
    }

    async function handleUpdate(e) {
        e.preventDefault()
        setSubmitting(true)
        try {
            const res = await fetch(`/api/backend/admin/sports/${editingSport.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData)
            })

            const data = await res.json()

            if (res.ok) {
                setMessage({ type: 'success', text: 'Esporte atualizado com sucesso!' })
                setIsEditOpen(false)
                fetchSports()
            } else {
                alert(data.error || 'Erro ao atualizar esporte.')
            }
        } catch (error) {
            alert('Erro de conexão ao atualizar.')
        } finally {
            setSubmitting(false)
        }
    }

    async function handleDelete(id) {
        if (!confirm('Deseja excluir permanentemente este esporte? Esta ação só será permitida se não houver atletas vinculados.')) return

        try {
            const res = await fetch(`/api/backend/admin/sports/${id}`, {
                method: 'DELETE'
            })

            const data = await res.json()

            if (res.ok) {
                setMessage({ type: 'success', text: 'Esporte excluído com sucesso.' })
                fetchSports()
            } else {
                alert(data.error || 'Erro ao excluir esporte.')
            }
        } catch (error) {
            alert('Erro de conexão ao excluir.')
        }
    }

    const addPosition = (isEdit = false) => {
        const val = isEdit ? positionInput : positionInput
        if (!positionInput.trim()) return

        if (isEdit) {
            setEditFormData(prev => ({
                ...prev,
                positions: [...new Set([...prev.positions, positionInput.trim()])]
            }))
        } else {
            setFormData(prev => ({
                ...prev,
                positions: [...new Set([...prev.positions, positionInput.trim()])]
            }))
        }
        setPositionInput('')
    }

    const removePosition = (pos, isEdit = false) => {
        if (isEdit) {
            setEditFormData(prev => ({
                ...prev,
                positions: prev.positions.filter(p => p !== pos)
            }))
        } else {
            setFormData(prev => ({
                ...prev,
                positions: prev.positions.filter(p => p !== pos)
            }))
        }
    }

    const openEdit = (sport) => {
        setEditingSport(sport)
        setEditFormData({
            name: sport.name,
            slug: sport.slug,
            positions: sport.positions || [],
            isActive: sport.isActive
        })
        setIsEditOpen(true)
    }

    const filteredSports = sports.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.slug.toLowerCase().includes(search.toLowerCase())
    )

    const autoGenerateSlug = (name) => {
        const slug = name.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
        setFormData(prev => ({ ...prev, name, slug }))
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Gestão de Esportes</h1>
                    <p className="text-slate-500 mt-1">Configure as modalidades e suas posições oficiais.</p>
                </div>
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        onClick={handleSyncDefaults}
                        disabled={syncing}
                        className="bg-white border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 transition-all font-semibold shadow-sm active:scale-95 flex items-center gap-2"
                    >
                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Sincronizar Padrões
                    </Button>
                    <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-100 rounded-lg">
                        <Trophy className="w-5 h-5 text-green-600" />
                        <span className="text-sm font-semibold text-green-700">{sports.length} Modalidades</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Adicionar */}
                <div className="lg:col-span-1">
                    <Card className="border-slate-200 shadow-sm sticky top-8">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Plus className="w-5 h-5 text-green-600" />
                                Adicionar Novo
                            </CardTitle>
                            <CardDescription>Cadastre um novo esporte e suas posições.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Nome do Esporte</label>
                                    <Input
                                        placeholder="Ex: Tênis de Mesa"
                                        value={formData.name}
                                        onChange={(e) => autoGenerateSlug(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Identificador (Slug)</label>
                                    <Input
                                        placeholder="ex: tenis-de-mesa"
                                        value={formData.slug}
                                        onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Posições Técnicas</label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Ex: Atacante"
                                            value={positionInput}
                                            onChange={(e) => setPositionInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPosition(false))}
                                        />
                                        <Button type="button" variant="outline" onClick={() => addPosition(false)}>Add</Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {formData.positions.map(pos => (
                                            <Badge key={pos} variant="secondary" className="pl-2 flex items-center gap-1 group">
                                                {pos}
                                                <X className="w-3 h-3 cursor-pointer opacity-50 group-hover:opacity-100" onClick={() => removePosition(pos, false)} />
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                {message.text && (
                                    <div className={`p-3 rounded-lg flex items-center gap-3 text-sm animate-in zoom-in duration-300 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                                        }`}>
                                        {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                        {message.text}
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    className="w-full bg-green-600 hover:bg-green-700 transition-all font-semibold shadow-md active:scale-95"
                                    disabled={submitting}
                                >
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cadastrar Esporte'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>

                {/* Lista de Esportes */}
                <div className="lg:col-span-2 space-y-4">
                    <Card className="border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    className="pl-9 bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-green-500"
                                    placeholder="Buscar esporte..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-12 flex justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                            <th className="px-6 py-4">Modalidade</th>
                                            <th className="px-6 py-4">Posições</th>
                                            <th className="px-6 py-4 text-center">Cadastro</th>
                                            <th className="px-6 py-4 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredSports.map((sport) => (
                                            <tr key={sport.id} className={`hover:bg-slate-50/50 transition-colors group ${!sport.isActive ? 'opacity-60' : ''}`}>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${sport.isActive ? 'bg-slate-100 group-hover:bg-green-100' : 'bg-slate-200'}`}>
                                                            <Activity className={`w-4 h-4 ${sport.isActive ? 'text-slate-400 group-hover:text-green-600' : 'text-slate-500'}`} />
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-slate-900 flex items-center gap-2">
                                                                {sport.name}
                                                                {!sport.isActive && <Badge variant="outline" className="text-[10px] font-bold py-0 h-4">Inativo</Badge>}
                                                            </div>
                                                            <div className="text-xs text-slate-400 font-mono">{sport.slug}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                        {sport.positions?.slice(0, 3).map(pos => (
                                                            <Badge key={pos} variant="outline" className="text-[10px] py-0 px-1">{pos}</Badge>
                                                        ))}
                                                        {sport.positions?.length > 3 && <span className="text-[10px] text-slate-400">+{sport.positions.length - 3}</span>}
                                                        {(!sport.positions || sport.positions.length === 0) && <span className="text-[10px] text-slate-300">Sem posições</span>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="text-sm font-semibold text-slate-700">{sport._count?.profiles || 0}</div>
                                                        <div className="text-[10px] text-slate-400 uppercase tracking-tighter">Atletas</div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button variant="ghost" size="icon" onClick={() => openEdit(sport)} className="h-8 w-8 text-slate-400 hover:text-green-600">
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(sport.id)} className="h-8 w-8 text-slate-400 hover:text-red-600">
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            {/* Modal de Edição */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Editar Modalidade</DialogTitle>
                        <DialogDescription>
                            Atualize as informações de {editingSport?.name}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Nome</label>
                                <Input
                                    value={editFormData.name}
                                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Identificador</label>
                                <Input
                                    value={editFormData.slug}
                                    onChange={(e) => setEditFormData({ ...editFormData, slug: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <div>
                                <p className="text-sm font-bold text-slate-700">Status do Esporte</p>
                                <p className="text-xs text-slate-500">Esportes inativos não aparecem para novos atletas.</p>
                            </div>
                            <Button
                                variant={editFormData.isActive ? "outline" : "destructive"}
                                size="sm"
                                onClick={() => setEditFormData({ ...editFormData, isActive: !editFormData.isActive })}
                                className="font-bold flex items-center gap-2"
                            >
                                {editFormData.isActive ? <CheckCircle2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                {editFormData.isActive ? "Ativo" : "Inativo"}
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Posições Oficiais</label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Ex: Armador"
                                    value={positionInput}
                                    onChange={(e) => setPositionInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPosition(true))}
                                />
                                <Button type="button" variant="outline" onClick={() => addPosition(true)}>Add</Button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2 max-h-[120px] overflow-y-auto p-1">
                                {editFormData.positions.map(pos => (
                                    <Badge key={pos} variant="secondary" className="pl-2 flex items-center gap-1 group">
                                        {pos}
                                        <X className="w-3 h-3 cursor-pointer opacity-50 group-hover:opacity-100" onClick={() => removePosition(pos, true)} />
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
                        <Button onClick={handleUpdate} disabled={submitting} className="bg-green-600 hover:bg-green-700">
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Alterações'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
