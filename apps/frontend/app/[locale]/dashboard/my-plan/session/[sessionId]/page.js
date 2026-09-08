'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Loader2, ChevronLeft, CheckCircle2, Clock, Dumbbell, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import ExerciseVideoPreview from '@/components/ui/exercise-video-preview'

function ExerciseCard({ ex, onClick }) {
    const [hovered, setHovered] = useState(false)

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`group text-left rounded-2xl border transition-all hover:shadow-md overflow-hidden w-full
                ${ex.completed ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'}`}
        >
            {/* Thumb / Teaser */}
            <div className="relative aspect-video bg-gray-100 w-full overflow-hidden">
                <ExerciseVideoPreview
                    exercise={ex}
                    enableVideoHoverPreview={true}
                    videoHoverType="TEASER"
                    isHovered={hovered}
                    isOwner={false}
                />
                {ex.completed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
                        <div className="bg-green-500 rounded-full p-2">
                            <CheckCircle2 className="w-5 h-5 text-white" />
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4">
                <h3 className={`font-bold text-sm leading-tight mb-2 ${ex.completed ? 'text-green-700 line-through decoration-green-400' : 'text-gray-900'}`}>
                    {ex.name}
                </h3>
                <div className="flex gap-2 flex-wrap">
                    <span className="text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded-full">
                        {ex.sets} séries
                    </span>
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
                        {ex.reps} reps
                    </span>
                    {ex.restSeconds > 0 && (
                        <span className="text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
                            {ex.restSeconds}s descanso
                        </span>
                    )}
                    {ex.category && (
                        <span className="text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded-full capitalize">
                            {ex.category}
                        </span>
                    )}
                </div>
            </div>
        </button>
    )
}

export default function SessionPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const params = useParams()
    const sessionId = params.sessionId

    const [trainingSession, setTrainingSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [feedback, setFeedback] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (status === 'loading') return
        if (!session) { router.push('/'); return }
        fetchSession()
    }, [session, status])

    const fetchSession = async () => {
        try {
            const res = await fetch(`/api/backend/training-plans/sessions/${sessionId}`)
            if (!res.ok) throw new Error('Sessão não encontrada')
            const data = await res.json()
            const s = data.session || data
            setTrainingSession(s)
            setFeedback(s.athleteFeedback || '')
        } catch (err) {
            toast.error(err.message)
            router.push('/dashboard/my-plan')
        } finally {
            setLoading(false)
        }
    }

    const parseExercises = (json) => {
        try { return JSON.parse(json || '[]') } catch { return [] }
    }

    const handleMarkComplete = async () => {
        setSaving(true)
        try {
            const exercises = parseExercises(trainingSession.exercises)
            const allDone = exercises.map(e => ({ ...e, completed: true }))
            const res = await fetch(`/api/backend/training-plans/sessions/${sessionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: true, athleteFeedback: feedback, exercises: allDone })
            })
            if (!res.ok) throw new Error('Erro ao atualizar sessão')
            const data = await res.json()
            if (data.planCompleted) toast.success('🏆 Parabéns! Você concluiu todas as sessões!')
            else toast.success(`✅ Dia ${trainingSession.day} concluído!`)
            fetchSession()
        } catch (err) { toast.error(err.message) }
        finally { setSaving(false) }
    }

    const handleSaveFeedback = async () => {
        setSaving(true)
        try {
            const res = await fetch(`/api/backend/training-plans/sessions/${sessionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: trainingSession.completed, athleteFeedback: feedback })
            })
            if (!res.ok) throw new Error('Erro ao salvar feedback')
            toast.success('Feedback salvo!')
        } catch (err) { toast.error(err.message) }
        finally { setSaving(false) }
    }

    const handleExerciseClick = (ex, idx) => {
        // Exercícios da biblioteca → reutiliza a página existente com VideoPlayer + ficha técnica completa
        if (ex.exerciseId) {
            router.push(`/dashboard/exercises/${ex.exerciseId}?sets=${ex.sets}&reps=${ex.reps}&rest=${ex.restSeconds}`)
        } else {
            // Exercícios gerados pela IA → página de detalhe student-accessible
            router.push(`/dashboard/my-plan/session/${sessionId}/exercise/${idx}`)
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
    )

    if (!trainingSession) return null

    const exercises = parseExercises(trainingSession.exercises)
    const doneCount = exercises.filter(e => e.completed).length

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
            {/* Back */}
            <button onClick={() => router.back()}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Voltar ao plano
            </button>

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">Dia {trainingSession.day}</p>
                    <h1 className="text-2xl font-black text-gray-900">{trainingSession.title || `Treino do Dia ${trainingSession.day}`}</h1>
                    {trainingSession.duration && (
                        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                            <Clock className="w-4 h-4" /> {trainingSession.duration} min
                        </p>
                    )}
                    {trainingSession.description && (
                        <p className="text-sm text-gray-600 mt-2 leading-relaxed">{trainingSession.description}</p>
                    )}
                </div>
                {trainingSession.completed && (
                    <div className="flex items-center gap-1.5 text-green-600 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm font-semibold flex-shrink-0">
                        <CheckCircle2 className="w-4 h-4" /> Concluído
                    </div>
                )}
            </div>

            {/* Progresso */}
            {exercises.length > 0 && (
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>Exercícios concluídos</span>
                        <span className="font-bold text-gray-700">{doneCount}/{exercises.length}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                            className="bg-gradient-to-r from-green-400 to-emerald-500 h-2 rounded-full transition-all"
                            style={{ width: `${exercises.length > 0 ? (doneCount / exercises.length) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Grid de exercícios */}
            {exercises.length > 0 ? (
                <div>
                    <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Dumbbell className="w-4 h-4 text-green-600" /> Exercícios
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {exercises.map((ex, idx) => (
                            <ExerciseCard
                                key={idx}
                                ex={ex}
                                onClick={() => handleExerciseClick(ex, idx)}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-center py-10 text-gray-400">
                    <Dumbbell className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Esta sessão ainda não tem exercícios cadastrados.</p>
                </div>
            )}

            {/* Feedback + concluir */}
            {!trainingSession.completed && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-500" /> Feedback deste treino
                    </h3>
                    <Textarea
                        value={feedback}
                        onChange={e => setFeedback(e.target.value)}
                        placeholder="Como foi o treino? Algo que você sentiu ou observou?"
                        rows={3}
                        className="text-sm resize-none"
                    />
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleSaveFeedback} disabled={saving}>
                            Salvar feedback
                        </Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 flex-1"
                            onClick={handleMarkComplete} disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar sessão como concluída
                        </Button>
                    </div>
                </div>
            )}

            {trainingSession.athleteFeedback && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                    <h3 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" /> Seu feedback
                    </h3>
                    <p className="text-sm text-blue-800 whitespace-pre-wrap">{trainingSession.athleteFeedback}</p>
                </div>
            )}
        </div>
    )
}
