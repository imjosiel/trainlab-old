'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Trophy, Calendar, CheckCircle2, Dumbbell, Clock, ChevronRight, Download, Play } from 'lucide-react'
import { toast } from 'sonner'

export default function MyPlanPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [plans, setPlans] = useState([])
    const [activePlanIndex, setActivePlanIndex] = useState(0)
    const [loading, setLoading] = useState(true)
    const [downloading, setDownloading] = useState(false)

    useEffect(() => {
        if (status === 'loading') return
        if (!session) { router.push('/'); return }
        fetchPlan()
    }, [session, status])

    const fetchPlan = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/backend/training-plans/active')
            if (res.ok) {
                const data = await res.json()
                setPlans(data.plans || [])
            }
        } catch { toast.error('Erro ao carregar planos') }
        finally { setLoading(false) }
    }

    const handleDownloadPDF = async (plan) => {
        setDownloading(true)
        try {
            const res = await fetch(`/api/backend/training-plans/${plan.id}/pdf`)
            if (!res.ok) throw new Error('Erro ao gerar PDF')
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `plano_treino_${plan.trainer?.name || 'treinador'}.pdf`
            a.click()
            URL.revokeObjectURL(url)
            toast.success('PDF gerado!')
        } catch (err) { toast.error(err.message) }
        finally { setDownloading(false) }
    }

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
    )

    if (plans.length === 0) return (
        <div className="max-w-2xl mx-auto py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Dumbbell className="w-9 h-9 text-gray-300" />
            </div>
            <h2 className="text-xl font-bold text-gray-700 mb-2">Nenhum plano ativo</h2>
            <p className="text-gray-500">Aguarde seu treinador criar e aprovar um plano para você.</p>
        </div>
    )

    const plan = plans[activePlanIndex]
    const { progress, trainingSessions } = plan
    const isCompleted = plan.status === 'COMPLETED' || (progress.total > 0 && progress.completed === progress.total)

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">

            {/* Hero do plano */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-7 text-white shadow-xl">
                <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-green-400/10 blur-3xl" />

                <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
                    <div className="flex-1">
                        <p className="text-green-400 text-xs font-bold tracking-widest uppercase mb-1">Meu Plano de Treino</p>
                        <h1 className="text-2xl font-black leading-tight">{plan.title}</h1>

                        {plan.trainer && (
                            <div className="flex items-center gap-2 mt-3">
                                <Avatar className="h-7 w-7 border border-white/20">
                                    <AvatarImage src={plan.trainer.image} />
                                    <AvatarFallback className="text-xs bg-green-800 text-green-200">{plan.trainer.name?.[0]}</AvatarFallback>
                                </Avatar>
                                <span className="text-white/60 text-sm">Treinador: <span className="text-white font-semibold">{plan.trainer.name}</span></span>
                            </div>
                        )}

                        <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between text-sm text-white/60">
                                <span>{progress.completed} de {progress.total} sessões concluídas</span>
                                <span className="text-green-400 font-bold text-lg">{progress.percent}%</span>
                            </div>
                            <div className="w-full bg-white/10 rounded-full h-2">
                                <div
                                    className="bg-gradient-to-r from-green-400 to-emerald-500 h-2 rounded-full transition-all"
                                    style={{ width: `${progress.percent}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-2">
                        {isCompleted && (
                            <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-400/30 text-sm px-3 py-1">
                                <Trophy className="w-4 h-4 mr-1" /> Plano Concluído!
                            </Badge>
                        )}
                        <Button variant="outline" size="sm"
                            className="border-white/20 text-white hover:bg-white/10 bg-transparent"
                            onClick={() => handleDownloadPDF(plan)} disabled={downloading}>
                            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Baixar PDF
                        </Button>
                    </div>
                </div>
            </div>

            {/* Tabs se houver mais de um plano */}
            {plans.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                    {plans.map((p, i) => (
                        <button key={p.id} onClick={() => setActivePlanIndex(i)}
                            className={`whitespace-nowrap px-4 py-2 text-sm font-medium rounded-xl transition-colors ${i === activePlanIndex
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {p.trainer?.name ? `Treinador: ${p.trainer.name}` : `Plano ${i + 1}`}
                        </button>
                    ))}
                </div>
            )}

            {/* Grid de sessões */}
            <div>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-green-600" /> Sessões de Treino
                </h2>

                {trainingSessions.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <Dumbbell className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>As sessões serão criadas pelo treinador em breve.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {trainingSessions.map((s) => {
                            const exercises = (() => {
                                try { return JSON.parse(s.exercises || '[]') } catch { return [] }
                            })()
                            const doneCount = exercises.filter(e => e.completed).length

                            return (
                                <button
                                    key={s.id}
                                    onClick={() => router.push(`/dashboard/my-plan/session/${s.id}`)}
                                    className={`group text-left rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden
                                        ${s.completed
                                            ? 'border-green-200 bg-gradient-to-br from-green-50 to-emerald-50'
                                            : 'border-gray-200 bg-white hover:border-green-300'}`}
                                >
                                    {/* Barra topo */}
                                    <div className={`absolute top-0 left-0 right-0 h-1 ${s.completed ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gray-100 group-hover:bg-green-200 transition-colors'}`} />

                                    <div className="flex items-start justify-between mb-3">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Dia {s.day}</span>
                                        {s.completed
                                            ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                            : <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-green-500 group-hover:translate-x-0.5 transition-all" />
                                        }
                                    </div>

                                    <h3 className={`font-bold text-base leading-snug mb-3 ${s.completed ? 'text-green-800' : 'text-gray-900'}`}>
                                        {s.title || `Treino do Dia ${s.day}`}
                                    </h3>

                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                        {s.duration && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" /> {s.duration} min
                                            </span>
                                        )}
                                        {exercises.length > 0 && (
                                            <span className="flex items-center gap-1">
                                                <Dumbbell className="w-3.5 h-3.5" /> {exercises.length} exercícios
                                            </span>
                                        )}
                                    </div>

                                    {exercises.length > 0 && (
                                        <div className="mt-3">
                                            <div className="w-full bg-gray-100 rounded-full h-1">
                                                <div
                                                    className="bg-green-500 h-1 rounded-full"
                                                    style={{ width: `${exercises.length > 0 ? (doneCount / exercises.length) * 100 : 0}%` }}
                                                />
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">{doneCount}/{exercises.length} concluídos</p>
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Notas do treinador */}
            {plan.trainerNotes && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                    <h3 className="font-bold text-blue-900 text-sm mb-2 flex items-center gap-2">
                        💬 Observações do Treinador {plan.trainer && <span className="font-normal text-blue-600">— {plan.trainer.name}</span>}
                    </h3>
                    <p className="text-sm text-blue-800 whitespace-pre-wrap leading-relaxed">{plan.trainerNotes}</p>
                </div>
            )}
        </div>
    )
}
