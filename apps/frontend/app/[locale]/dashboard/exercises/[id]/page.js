'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
    ArrowLeft, 
    Video as VideoIcon, 
    FileText, 
    Clock, 
    Zap, 
    Trophy, 
    Share2, 
    Printer,
    CheckCircle2,
    BookOpen,
    Play,
    Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import VideoPlayer from '@/components/ui/video-player'

export default function ExerciseDetailsPage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const router = useRouter()
    const [exercise, setExercise] = useState(null)
    const [loading, setLoading] = useState(true)
    const [sanitizedDescription, setSanitizedDescription] = useState('')

    // CDN público R2 para thumbnail poster
    const R2_CDN = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''

    // Retorna a URL de vídeo para reprodução
    // Quando hlsProcessed=true: usa CDN HLS (master.m3u8) — qualidade adaptativa
    // Se master.m3u8 não existir (exercícios antigos): VideoPlayer faz fallback para fallbackSrc (MP4)
    const getVideoSrc = (ex) => {
        if (!ex) return null
        if (ex.hlsProcessed && ex.originalVideoKey && R2_CDN) {
            const base = ex.originalVideoKey.replace(/\/[^/]+$/, '')  // remove filename
            return `${R2_CDN}/${base}/hls/master.m3u8`
        }
        return ex.videoUrl  // MP4 original via proxy autenticado
    }

    // Poster via CDN público (thumb.jpg gerado pelo GH Actions)
    const getPosterUrl = (ex) => {
        if (!ex?.originalVideoKey) return null
        if (R2_CDN) {
            const base = ex.originalVideoKey.replace(/\/[^/]+$/, '')
            return `${R2_CDN}/${base}/thumb.jpg`
        }
        return null
    }

    // Pegar dosagem vinda do plano de treino (opcional)
    const sets = searchParams.get('sets')
    const reps = searchParams.get('reps')
    const rest = searchParams.get('rest')

    useEffect(() => {
        const controller = new AbortController()
        const fetchExercise = async () => {
            try {
                const res = await fetch(`/api/backend/exercises/${params.id}`, { signal: controller.signal })
                if (res.ok) {
                    const data = await res.json()
                    setExercise(data.exercise)
                } else {
                    toast.error('Exercício não encontrado')
                    router.push('/dashboard/exercises')
                }
            } catch (error) {
                if (error?.name === 'AbortError') return  // navegação normal — ignorar
                toast.error('Erro ao carregar detalhes')
            } finally {
                setLoading(false)
            }
        }
        fetchExercise()
        return () => controller.abort()
    }, [params.id])

    // Sanitizar HTML com DOMPurify (client-only) — Risco #1 do plano
    useEffect(() => {
        if (!exercise?.description) return
        if (!(exercise.description ?? '').startsWith('<')) return
        import('dompurify').then(({ default: DOMPurify }) => {
            setSanitizedDescription(DOMPurify.sanitize(exercise.description))
        })
    }, [exercise])

    const [downloading, setDownloading] = useState(false)

    const handleDownloadPDF = async () => {
        setDownloading(true)
        try {
            const res = await fetch(`/api/backend/exercises/${params.id}/pdf`)
            if (!res.ok) throw new Error('Erro ao gerar PDF')
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `cheat_sheet_${(exercise?.name || 'exercicio').replace(/\s+/g, '_')}.pdf`
            a.click()
            URL.revokeObjectURL(url)
            toast.success('PDF gerado com sucesso!')
        } catch (err) {
            toast.error('Erro ao baixar PDF')
        } finally {
            setDownloading(false)
        }
    }

    if (loading) {
        return (
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
    }

    if (!exercise) return null

    return (
        <div className="max-w-7xl mx-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header / Navigation */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 sticky top-0 bg-white/80 backdrop-blur-md z-10 py-4 -mx-4 px-4 rounded-b-2xl border-b border-gray-100">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => router.back()}
                        className="rounded-full hover:bg-green-50 hover:text-green-600 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-none px-3">
                                {exercise.category}
                            </Badge>
                            <Badge variant="outline" className="border-gray-200 text-gray-500">
                                {exercise.difficulty}
                            </Badge>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
                            {exercise.name}
                        </h1>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Button 
                        variant="outline" 
                        className="flex-1 md:flex-none gap-2 border-gray-200 hover:bg-gray-50 rounded-xl"
                        onClick={handleDownloadPDF}
                        disabled={downloading}
                    >
                        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                        {downloading ? 'Gerando...' : 'Baixar Cheat Sheet'}
                    </Button>
                    <Button 
                        className="flex-1 md:flex-none gap-2 bg-green-600 hover:bg-green-700 rounded-xl shadow-lg shadow-green-200"
                    >
                        <Share2 className="w-4 h-4" />
                        Compartilhar
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 px-2">
                {/* Main Content: Video Player */}
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
                                <p className="text-lg font-medium opacity-50">Nenhum vídeo disponível para esta aula</p>
                            </div>
                        )}
                    </div>

                    <Card className="rounded-3xl border-gray-100 shadow-sm overflow-hidden">
                        <CardContent className="p-8">
                            <div className="flex items-center gap-2 mb-6">
                                <FileText className="w-5 h-5 text-green-600" />
                                <h2 className="text-xl font-bold text-gray-900">Sobre este Exercício</h2>
                            </div>
                            <div className="prose prose-green max-w-none text-gray-600 leading-relaxed">
                                {(exercise.description ?? '').startsWith('<')
                                    ? sanitizedDescription
                                        ? <div dangerouslySetInnerHTML={{ __html: sanitizedDescription }} />
                                        : <div className="animate-pulse space-y-2">
                                            <div className="h-3 bg-gray-100 rounded w-full" />
                                            <div className="h-3 bg-gray-100 rounded w-4/5" />
                                          </div>
                                    : <div className="whitespace-pre-wrap">{exercise.description}</div>
                                }
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar: Details & Stats */}
                <div className="lg:col-span-4 space-y-6">
                    <Card className="rounded-3xl border-gray-100 shadow-sm overflow-hidden bg-gradient-to-br from-white to-gray-50">
                        <CardContent className="p-6 space-y-6">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Zap className="w-5 h-5 text-orange-500 fill-orange-500" />
                                Ficha Técnica
                            </h3>

                            {sets && (
                                <div className="p-4 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Zap className="w-4 h-4 text-orange-600" />
                                        <span className="text-sm font-bold text-orange-700">Dose Prescrita:</span>
                                    </div>
                                    <span className="text-sm font-black text-orange-700">{sets}x / {reps}r / {rest}s</span>
                                </div>
                            )}
                            
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 rounded-xl">
                                            <Trophy className="w-4 h-4 text-blue-600" />
                                        </div>
                                        <span className="text-sm font-medium text-gray-600">Dificuldade</span>
                                    </div>
                                    <span className="text-sm font-bold text-gray-900 capitalize">{exercise.difficulty}</span>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-50 rounded-xl">
                                            <BookOpen className="w-4 h-4 text-purple-600" />
                                        </div>
                                        <span className="text-sm font-medium text-gray-600">Categoria</span>
                                    </div>
                                    <span className="text-sm font-bold text-gray-900 capitalize">{exercise.category}</span>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-green-50 rounded-xl">
                                            <Clock className="w-4 h-4 text-green-600" />
                                        </div>
                                        <span className="text-sm font-medium text-gray-600">Duração Sugerida</span>
                                    </div>
                                    <span className="text-sm font-bold text-gray-900">15-20 min</span>
                                </div>
                            </div>

                            <div className="p-5 rounded-2xl bg-green-600 text-white shadow-lg shadow-green-100 relative overflow-hidden group">
                                <div className="relative z-10">
                                    <h4 className="font-bold mb-1 flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Dica do Treinador
                                    </h4>
                                    <p className="text-xs text-green-50 leading-relaxed">
                                        Mantenha a postura e o foco na execução técnica. A qualidade vale mais que a velocidade.
                                    </p>
                                </div>
                                <Play className="absolute -bottom-2 -right-2 w-24 h-24 text-white/10 -rotate-12 transition-transform group-hover:scale-110" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-3xl border-dashed border-2 border-gray-200 bg-transparent">
                        <CardContent className="p-8 text-center">
                            <h3 className="font-bold text-gray-900 mb-2">Suporte à Progressão</h3>
                            <p className="text-sm text-gray-500 mb-6">
                                Este exercício foi validado pelo sistema e está pronto para ser incluído no seu plano de desenvolvimento.
                            </p>
                            <Button variant="outline" className="w-full rounded-xl border-gray-300">
                                Ver Exercícios Relacionados
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
