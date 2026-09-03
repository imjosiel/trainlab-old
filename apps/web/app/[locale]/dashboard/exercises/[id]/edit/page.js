'use client'

import { ROLES } from '@/lib/constants'
import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, Loader2, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import R2VideoUpload from '@/components/ui/r2-video-upload'

const RichEditor = dynamic(() => import('@/components/ui/rich-editor'), { ssr: false })

export default function EditExercisePage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const { id } = useParams()

    const [form, setForm] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [uploadingVideo, setUploadingVideo] = useState(false)
    const autosaveRef = useRef(null)
    const isDirtyRef  = useRef(false)
    const initialLoadRef = useRef(true)
    const savingRef   = useRef(false)

    const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)

    // Carregar exercício
    useEffect(() => {
        if (!id || status !== 'authenticated') return
        fetch(`/api/backend/exercises/${id}`)
            .then(r => r.json())
            .then(data => {
                const ex = data.exercise
                if (!ex) { toast.error(data.error || 'Exercício não encontrado'); router.push('/dashboard/exercises'); return }
                setForm({
                    name: ex.name ?? '',
                    description: ex.description ?? '',
                    category: ex.category ?? 'Técnico',
                    difficulty: ex.difficulty ?? 'Iniciante',
                    videoUrl: ex.videoUrl ?? '',
                    originalVideoKey: ex.originalVideoKey ?? '',
                })
            })
            .catch(() => toast.error('Erro ao carregar exercício'))
            .finally(() => setLoading(false))
    }, [id, status, router])

    // Autosave a cada 30s
    useEffect(() => {
        if (!form) return
        if (autosaveRef.current) clearInterval(autosaveRef.current)
        autosaveRef.current = setInterval(() => {
            try {
                if (savingRef.current) return  // não salvar durante submit ativo
                const draft = { ...form, description: (form.description || '').slice(0, 20000) }
                localStorage.setItem(`exercise-draft-${id}`, JSON.stringify(draft))
            } catch { /* ignora */ }
        }, 30000)
        return () => clearInterval(autosaveRef.current)
    }, [form, id])

    // Marca como dirty após carga inicial (quando usuário edita)
    // initialLoadRef começa true — na primeira execução do efeito (carga da API),
    // apenas o desativa e retorna. Edições subsequentes do usuário setam isDirtyRef.
    useEffect(() => {
        if (!form) return
        if (initialLoadRef.current) { initialLoadRef.current = false; return }
        isDirtyRef.current = true
    }, [form])

    // Aviso ao sair apenas quando há alterações não salvas (Risco #5)
    useEffect(() => {
        const handler = (e) => {
            if (!isDirtyRef.current) return
            e.preventDefault(); e.returnValue = ''
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [])

    useEffect(() => {
        if (status === 'unauthenticated' || (status === 'authenticated' && !isTrainer)) {
            router.push('/dashboard')
        }
    }, [status, isTrainer, router])

    const handleSave = async () => {
        if (!form?.name?.trim()) { toast.error('Nome do exercício é obrigatório.'); return }
        const plainDesc = (form.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        if (!plainDesc) { toast.error('A descrição não pode estar vazia.'); return }

        savingRef.current = true
        setSaving(true)
        try {
            const res  = await fetch(`/api/backend/exercises/${id}`, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(form),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar')
            localStorage.removeItem(`exercise-draft-${id}`)
            isDirtyRef.current = false
            toast.success(data.message || 'Exercício atualizado!')
            router.push(`/dashboard/exercises/${id}`)
        } catch (err) {
            toast.error(err.message)
        } finally {
            savingRef.current = false
            setSaving(false)
        }
    }

    if (status === 'loading' || loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        )
    }

    if (!form) return null

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Editar Exercício</h1>
                        <p className="text-sm text-gray-500">{form.name}</p>
                    </div>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={saving || uploadingVideo}
                    className="bg-green-600 hover:bg-green-700"
                >
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {uploadingVideo ? '⏳ Enviando vídeo...' : 'Salvar Alterações'}
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
                {/* Nome */}
                <div className="space-y-2">
                    <Label htmlFor="name">Nome do Exercício</Label>
                    <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Ex: Roda de Bobinho em Espaço Reduzido"
                        className="text-base"
                    />
                </div>

                {/* Categoria + Dificuldade */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Categoria</Label>
                        <Select value={form.category} onValueChange={(v) => setForm(p => ({ ...p, category: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {['Físico','Técnico','Tático','Mental','Aquecimento','Recuperação','Finalização','Goleiro','Outro'].map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Dificuldade</Label>
                        <Select value={form.difficulty} onValueChange={(v) => setForm(p => ({ ...p, difficulty: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {['Iniciante','Intermediário','Avançado','Profissional'].map(d => (
                                    <SelectItem key={d} value={d}>{d}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Descrição rica */}
                <div className="space-y-2">
                    <Label>Descrição / Instruções</Label>
                    <RichEditor
                        content={form.description}
                        onChange={(html) => setForm(p => ({ ...p, description: html }))}
                        placeholder="Explique como o exercício funciona..."
                    />
                </div>

                {/* Vídeo */}
                <div className="space-y-2">
                    <Label>Vídeo Demonstrativo (Opcional)</Label>
                    {!form.videoUrl ? (
                        <>
                            <R2VideoUpload
                                disabled={saving}
                                onProcessingChange={setUploadingVideo}
                                onUploadComplete={(result) => setForm(p => ({
                                    ...p,
                                    videoUrl: result.videoUrl,
                                    originalVideoKey: result.originalKey ?? '',
                                }))}
                            />
                            <div className="mt-2">
                                <Label className="text-xs text-gray-500 mb-1 block">Ou insira a URL manualmente (Youtube/Drive):</Label>
                                <Input
                                    value={form.videoUrl}
                                    onChange={(e) => setForm(p => ({ ...p, videoUrl: e.target.value }))}
                                    placeholder="https://youtube.com/watch?v=..."
                                />
                            </div>
                        </>
                    ) : (
                        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-green-100 p-2 rounded-full">
                                    <Video className="w-5 h-5 text-green-700" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-800">Vídeo Anexado</p>
                                    <a href={form.videoUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline truncate max-w-[300px] block">
                                        {form.videoUrl}
                                    </a>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50"
                                onClick={() => setForm(p => ({ ...p, videoUrl: '', originalVideoKey: '' }))}>
                                Remover
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
