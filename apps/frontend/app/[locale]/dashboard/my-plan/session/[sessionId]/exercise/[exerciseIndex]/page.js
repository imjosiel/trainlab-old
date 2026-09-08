'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Loader2, ChevronLeft, CheckCircle2, Circle, Zap, BarChart2, Tag, Timer, BookOpen, Video as VideoIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import VideoPlayer from '@/components/ui/video-player'

// Mesma lógica do /dashboard/exercises/[id]/page.js — fonte única de verdade
const R2_CDN = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''
const getVideoSrc = (ex) => {
    if (!ex) return null
    if (ex.hlsProcessed && ex.originalVideoKey && R2_CDN) {
        const base = ex.originalVideoKey.replace(/\/[^/]+$/, '')
        return `${R2_CDN}/${base}/hls/master.m3u8`
    }
    return ex.videoUrl
}
const getPosterUrl = (ex) => {
    if (!ex?.originalVideoKey) return null
    if (R2_CDN) {
        const base = ex.originalVideoKey.replace(/\/[^/]+$/, '')
        return `${R2_CDN}/${base}/thumb.jpg`
    }
    return null
}

export default function ExerciseDetailPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const params = useParams()
    const { sessionId, exerciseIndex } = params

    const [trainingSession, setTrainingSession] = useState(null)
    const [exercise, setExercise] = useState(null)
    const [loading, setLoading] = useState(true)
    const [marking, setMarking] = useState(false)

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
            const exercises = JSON.parse(s.exercises || '[]')
            const idx = parseInt(exerciseIndex)
            if (isNaN(idx) || idx >= exercises.length) throw new Error('Exercício não encontrado')
            setExercise(exercises[idx])
        } catch (err) {
            toast.error(err.message)
            router.back()
        } finally {
            setLoading(false)
        }
    }

    const handleToggleComplete = async () => {
        if (!trainingSession || !exercise) return
        setMarking(true)
        try {
            const exercises = JSON.parse(trainingSession.exercises || '[]')
            const idx = parseInt(exerciseIndex)
            exercises[idx] = { ...exercises[idx], completed: !exercises[idx].completed }
            const allDone = exercises.every(e => e.completed)
            const res = await fetch(`/api/backend/training-plans/sessions/${sessionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exercises, completed: allDone })
            })
            if (!res.ok) throw new Error('Erro ao atualizar')
            const nowDone = exercises[idx].completed
            toast.success(nowDone ? `✅ ${exercise.name} concluído!` : `🔄 ${exercise.name} desmarcado`)
            setExercise(exercises[idx])
            setTrainingSession(prev => ({ ...prev, exercises: JSON.stringify(exercises) }))
        } catch (err) { toast.error(err.message) }
        finally { setMarking(false) }
    }

    if (loading) return (
        <div className="max-w-6xl mx-auto space-y-8 p-4 md:p-8">
            <Skeleton className="h-10 w-48" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-4">
                    <Skeleton className="aspect-video w-full rounded-2xl" />
                    <Skeleton className="h-24 w-full" />
                </div>
                <div className="space-y-4">
                    <Skeleton className="h-64 w-full rounded-2xl" />
                </div>
            </div>
        </div>
    )

    if (!exercise) return null

    const isCompleted = exercise.completed

    return (
        <div className="max-w-7xl mx-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header — idêntico ao exercises/[id]/page.js */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 sticky top-0 bg-white/80 backdrop-blur-md z-10 py-4 -mx-4 px-4 rounded-b-2xl border-b border-gray-100">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon"
                        onClick={() => router.back()}
                        className="rounded-full hover:bg-green-50 hover:text-green-600">
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            {exercise.category && (
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none px-3">
                                    {exercise.category}
                                </Badge>
                            )}
                            {exercise.difficulty && (
                                <Badge variant="outline" className="border-gray-200 text-gray-500">
                                    {exercise.difficulty}
                                </Badge>
                            )}
                            {isCompleted && (
                                <Badge className="bg-green-600 text-white border-none">
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Concluído
                                </Badge>
                            )}
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
                            {exercise.name}
                        </h1>
                    </div>
                </div>
            </div>

            {/* Main grid — mesmo layout do exercises/[id] */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 px-2">
                {/* Vídeo + Descrição */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="rounded-3xl overflow-hidden shadow-2xl">
                        {exercise.videoUrl ? (
                            <VideoPlayer
                                src={getVideoSrc(exercise)}
                                fallbackSrc={exercise.videoUrl}
                                poster={getPosterUrl(exercise)}
                                title={exercise.name}
                            />
                        ) : (
                            <div className="aspect-video rounded-3xl flex flex-col items-center justify-center bg-gray-900 text-gray-500">
                                <VideoIcon className="w-16 h-16 mb-4 opacity-20" />
                                <p className="text-lg font-medium opacity-50">Nenhum vídeo disponível</p>
                            </div>
                        )}
                    </div>

                    {exercise.description && (
                        <Card className="rounded-3xl border-gray-100 shadow-sm overflow-hidden">
                            <CardContent className="p-8">
                                <div className="flex items-center gap-2 mb-6">
                                    <BookOpen className="w-5 h-5 text-green-600" />
                                    <h2 className="text-xl font-bold text-gray-900">Sobre este Exercício</h2>
                                </div>
                                <div className="prose prose-green max-w-none text-gray-600 leading-relaxed whitespace-pre-wrap">
                                    {exercise.description}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar: Ficha Técnica + Ação */}
                <div className="lg:col-span-4 space-y-6">
                    <Card className="rounded-3xl border-gray-100 shadow-sm overflow-hidden bg-gradient-to-br from-white to-gray-50">
                        <CardContent className="p-6 space-y-6">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Zap className="w-5 h-5 text-orange-500 fill-orange-500" />
                                Ficha Técnica
                            </h3>

                            {/* Dose prescrita */}
                            <div className="p-4 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-orange-600" />
                                    <span className="text-sm font-bold text-orange-700">Dose Prescrita:</span>
                                </div>
                                <span className="text-sm font-black text-orange-700">
                                    {exercise.sets}x / {exercise.reps}r{exercise.restSeconds > 0 ? ` / ${exercise.restSeconds}s` : ''}
                                </span>
                            </div>

                            <div className="space-y-4">
                                {exercise.difficulty && (
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-50 rounded-xl">
                                                <BarChart2 className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <span className="text-sm font-medium text-gray-600">Dificuldade</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900 capitalize">{exercise.difficulty}</span>
                                    </div>
                                )}
                                {exercise.category && (
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-purple-50 rounded-xl">
                                                <Tag className="w-4 h-4 text-purple-600" />
                                            </div>
                                            <span className="text-sm font-medium text-gray-600">Categoria</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900 capitalize">{exercise.category}</span>
                                    </div>
                                )}
                                {exercise.restSeconds > 0 && (
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-green-50 rounded-xl">
                                                <Timer className="w-4 h-4 text-green-600" />
                                            </div>
                                            <span className="text-sm font-medium text-gray-600">Descanso</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900">{exercise.restSeconds}s</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Marcar como feito */}
                    <Button
                        onClick={handleToggleComplete}
                        disabled={marking}
                        className={`w-full rounded-2xl py-6 font-bold text-base transition-all ${
                            isCompleted
                                ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200'
                                : 'bg-gray-900 hover:bg-gray-800 text-white'
                        }`}
                    >
                        {marking
                            ? <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            : isCompleted
                                ? <CheckCircle2 className="w-5 h-5 mr-2" />
                                : <Circle className="w-5 h-5 mr-2" />
                        }
                        {isCompleted ? 'Concluído ✓' : 'Marcar como feito'}
                    </Button>
                </div>
            </div>
        </div>
    )
}
