'use client'

import { ROLES } from '@/lib/constants'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Edit2, Trash2, Loader2, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import ExerciseVideoPreview from '@/components/ui/exercise-video-preview'

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE        = 12   // items fetched per API call
const WINDOW_SIZE      = 2    // max pages kept in DOM simultaneously
const CARD_HEIGHT_PX   = 320  // approx card height for placeholder sizing

// ─── ExerciseCard ─────────────────────────────────────────────────────────────
// Keeps the <video> always in the DOM to avoid re-fetch on every hover.
// Thumb fades out and teaser fades in only after `canplay` fires.

function ExerciseCard({ exercise, session, enableVideoHoverPreview, videoHoverType, onEdit, onDelete }) {
    const router = useRouter()
    const [showTeaser, setShowTeaser] = useState(false)


    const getDifficultyColor = (diff) => {
        switch ((diff || '').toLowerCase()) {
            case 'iniciante':      return 'bg-green-100 text-green-800'
            case 'intermediário':  return 'bg-blue-100 text-blue-800'
            case 'avançado':       return 'bg-orange-100 text-orange-800'
            case 'profissional':   return 'bg-red-100 text-red-800'
            default:               return 'bg-gray-100 text-gray-800'
        }
    }

    const isOwner = exercise.trainerId === session?.user?.id

    return (
        <Card
            className="flex flex-col group overflow-hidden transition-all hover:shadow-md cursor-pointer"
            onMouseEnter={() => setShowTeaser(true)}
            onMouseLeave={() => setShowTeaser(false)}
            onClick={() => router.push(`/dashboard/exercises/${exercise.id}`)}
        >
            {/* ── Media Container ─────────────────────────────────────────────── */}
            <div className="relative aspect-video bg-gray-100 overflow-hidden border-b">
                <ExerciseVideoPreview
                    exercise={exercise}
                    enableVideoHoverPreview={enableVideoHoverPreview}
                    videoHoverType={videoHoverType}
                    isHovered={showTeaser}
                    isOwner={isOwner}
                    processingProgress={exercise.processingProgress}
                />

                {/* Difficulty badge */}
                <div className="absolute top-2 right-2 flex gap-1 z-10">
                    <Badge className={`capitalize shadow-sm border-0 ${getDifficultyColor(exercise.difficulty)}`}>
                        {exercise.difficulty}
                    </Badge>
                </div>
            </div>

            {/* ── Card body ───────────────────────────────────────────────── */}
            <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-base font-bold leading-tight group-hover:text-green-700 transition-colors">
                        {exercise.name}
                    </CardTitle>
                </div>
                <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize text-gray-500 bg-gray-50">
                        {exercise.category}
                    </Badge>
                    {exercise.trainerId === null && (
                        <Badge className="text-[10px] h-4 px-1.5 bg-blue-50 text-blue-600 hover:bg-blue-50 border-0 shadow-none">
                            Sistema
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="p-4 pt-0 flex-grow">
                <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed mt-1">
                    {exercise.descriptionPlain || (exercise.description ?? '').replace(/<[^>]+>/g, ' ').trim()}
                </p>
            </CardContent>

            <CardFooter className="p-4 pt-2 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0">
                <div className="flex gap-2 w-full">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 text-[11px] flex-1 bg-green-50 text-green-700 hover:bg-green-100 border border-green-100"
                        onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/exercises/${exercise.id}`) }}
                    >
                        <BookOpen className="w-3 h-3 mr-1.5" /> Acessar Aula
                    </Button>

                    {isOwner && (
                        <div className="flex gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                                onClick={(e) => { e.stopPropagation(); onEdit(exercise) }}
                            >
                                <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
                                onClick={(e) => { e.stopPropagation(); onDelete(exercise) }}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    )}
                </div>
            </CardFooter>
        </Card>
    )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ExercisesLibraryPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    // ── All accumulated exercises (append-only while scrolling) ────────────
    const [allExercises,  setAllExercises]  = useState([])
    const [loading,       setLoading]       = useState(true)
    const [loadingMore,   setLoadingMore]   = useState(false)
    const [hasMore,       setHasMore]       = useState(false)
    const [total,         setTotal]         = useState(0)
    const nextPageRef     = useRef(1)
    const isFetchingRef   = useRef(false)

    // ── Filters ────────────────────────────────────────────────────────────
    const [searchTerm,     setSearchTerm]     = useState('')
    const [filterCategory, setFilterCategory] = useState('all')
    const searchDebounceRef = useRef(null)

    // ── Settings (from API) ────────────────────────────────────────────────
    const [enableVideoHoverPreview, setEnableVideoHoverPreview] = useState(true)
    const [videoHoverType,          setVideoHoverType]          = useState('TEASER')

    // ── Windowing state ────────────────────────────────────────────────────
    // We split allExercises into "pages" of PAGE_SIZE items.
    // windowStart/End define which page indices are currently rendered.
    // Pages outside the window are replaced by placeholder divs.
    const [windowStart, setWindowStart] = useState(0)
    const [windowEnd,   setWindowEnd]   = useState(WINDOW_SIZE - 1)

    const [saving,            setSaving]          = useState(false)
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false)
    const [exerciseToDelete,  setExerciseToDelete]  = useState(null)


    // ── Refs for IntersectionObserver ──────────────────────────────────────
    const sentinelRef = useRef(null)   // bottom sentinel → load more
    const listRef     = useRef(null)   // scroll container

    const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)

    // ── Fetch a single page ────────────────────────────────────────────────
    const fetchPage = useCallback(async (page, search, category, replace = false) => {
        if (isFetchingRef.current) return
        isFetchingRef.current = true

        if (page === 1) setLoading(true)
        else setLoadingMore(true)

        try {
            const params = new URLSearchParams({ category, page, limit: PAGE_SIZE })
            if (search) params.set('search', search)
            const res = await fetch(`/api/backend/exercises?${params}`)
            if (!res.ok) { toast.error('Erro ao carregar exercícios'); return }

            const data = await res.json()
            setEnableVideoHoverPreview(data.enableVideoHoverPreview ?? true)
            setVideoHoverType(data.videoHoverType ?? 'TEASER')

            setAllExercises(prev => replace ? data.exercises : [...prev, ...data.exercises])
            setHasMore(data.pagination.hasNext)
            setTotal(data.pagination.total)
            nextPageRef.current = page + 1

            if (replace) {
                setWindowStart(0)
                setWindowEnd(WINDOW_SIZE - 1)
            }
        } catch (err) {
            toast.error('Erro de conexão')
            console.error(err)
        } finally {
            setLoading(false)
            setLoadingMore(false)
            isFetchingRef.current = false
        }
    }, [])

    // ── Reset when filter/search changes ───────────────────────────────────
    const resetAndFetch = useCallback((search, category) => {
        nextPageRef.current = 1
        setAllExercises([])
        fetchPage(1, search, category, true)
    }, [fetchPage])

    // ── Polling de progresso para exercícios sendo processados (8s) ───────────
    useEffect(() => {
        const pending = allExercises.filter(ex => ex.originalVideoKey && !ex.hlsProcessed)
        if (pending.length === 0) return

        const poll = async () => {
            try {
                const ids = pending.map(ex => ex.id).join(',')
                const res = await fetch(`/api/backend/exercises?ids=${ids}&limit=50`)
                if (!res.ok) return
                const data = await res.json()
                setAllExercises(prev => prev.map(ex => {
                    const fresh = (data.exercises || []).find(f => f.id === ex.id)
                    if (!fresh) return ex
                    return { ...ex, processingProgress: fresh.processingProgress, hlsProcessed: fresh.hlsProcessed }
                }))
            } catch { /* non-fatal */ }
        }

        const interval = setInterval(poll, 8000)
        return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allExercises.map(ex => `${ex.id}:${ex.hlsProcessed}`).join(',')])

    // ── Initial load ───────────────────────────────────────────────────────
    useEffect(() => {
        if (status === 'unauthenticated' || (status === 'authenticated' && !isTrainer)) {
            router.push('/dashboard')
        } else if (status === 'authenticated') {
            resetAndFetch(searchTerm, filterCategory)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, router, filterCategory])

    // ── Debounced search ───────────────────────────────────────────────────
    const handleSearchChange = (value) => {
        setSearchTerm(value)
        clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = setTimeout(() => resetAndFetch(value, filterCategory), 400)
    }

    // ── Bottom sentinel IntersectionObserver (load more) ───────────────────
    useEffect(() => {
        const el = sentinelRef.current
        if (!el) return

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !isFetchingRef.current) {
                fetchPage(nextPageRef.current, searchTerm, filterCategory)
            }
        }, { rootMargin: '200px' })

        observer.observe(el)
        return () => observer.disconnect()
    }, [hasMore, searchTerm, filterCategory, fetchPage])

    // ── Scroll-based windowing ─────────────────────────────────────────────
    // Split allExercises into chunks of PAGE_SIZE (pages).
    // Track which chunk the user is scrolling through and keep ±1 page visible.
    const pageCount = Math.ceil(allExercises.length / PAGE_SIZE)

    useEffect(() => {
        const container = listRef.current
        if (!container) return

        const onScroll = () => {
            // Approximate which "page" the viewport center is on
            const scrollTop    = window.scrollY - (container.offsetTop || 0)
            const pageH        = PAGE_SIZE * (CARD_HEIGHT_PX / 3 /* 3 cols */) + 32 /* gap */
            const centerPage   = Math.floor(Math.max(0, scrollTop) / pageH)
            const newStart     = Math.max(0, centerPage - 1)
            const newEnd       = Math.min(pageCount - 1, centerPage + 1)

            setWindowStart(s => s !== newStart ? newStart : s)
            setWindowEnd(e => e !== newEnd ? newEnd : e)
        }

        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [pageCount])

    // ── Split exercises into page-chunks ───────────────────────────────────
    const chunks = []
    for (let i = 0; i < allExercises.length; i += PAGE_SIZE) {
        chunks.push(allExercises.slice(i, i + PAGE_SIZE))
    }

    // ── Handlers ───────────────────────────────────────────────────────────
    const handleOpenModal = (exercise = null) => {
        if (exercise?.id) {
            router.push(`/dashboard/exercises/${exercise.id}/edit`)
        } else {
            router.push('/dashboard/exercises/new')
        }
    }

    const confirmDelete = async () => {
        setSaving(true)
        try {
            const res  = await fetch(`/api/backend/exercises/${exerciseToDelete.id}`, { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao excluir')
            // Limpar rascunho do localStorage se existir
            try { localStorage.removeItem(`exercise-draft-${exerciseToDelete.id}`) } catch { /* ignora */ }
            toast.success(data.message)
            setIsDeleteAlertOpen(false)
            resetAndFetch(searchTerm, filterCategory)
        } catch (err) {
            toast.error(err.message)
        } finally {
            setSaving(false)
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────
    if (status === 'loading') {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        )
    }

    if (!isTrainer) return null

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Biblioteca de Exercícios</h1>
                    <p className="text-gray-600 mt-1">
                        Gerencie seu catálogo de treinos
                        {total > 0 && <span className="ml-1 text-gray-400 text-sm">· {total} exercícios</span>}
                    </p>
                </div>
                <Button onClick={() => handleOpenModal()} className="bg-green-600 hover:bg-green-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Exercício
                </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Buscar exercícios por nome ou descrição..."
                        value={searchTerm}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); resetAndFetch(searchTerm, v) }}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas as Categorias</SelectItem>
                        <SelectItem value="Físico">Físico</SelectItem>
                        <SelectItem value="Técnico">Técnico</SelectItem>
                        <SelectItem value="Tático">Tático</SelectItem>
                        <SelectItem value="Mental">Mental</SelectItem>
                        <SelectItem value="Aquecimento">Aquecimento</SelectItem>
                        <SelectItem value="Recuperação">Recuperação</SelectItem>
                        <SelectItem value="Finalização">Finalização</SelectItem>
                        <SelectItem value="Goleiro">Goleiro</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Exercise list */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            ) : allExercises.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200 border-dashed">
                    <BookOpen className="mx-auto h-12 w-12 text-gray-300" />
                    <h3 className="mt-2 text-sm font-semibold text-gray-900">Nenhum exercício encontrado</h3>
                    <p className="mt-1 text-sm text-gray-500">Comece adicionando seu primeiro exercício ao catálogo.</p>
                    <div className="mt-6">
                        <Button onClick={() => handleOpenModal()} variant="outline" className="text-green-600 border-green-200 bg-green-50 hover:bg-green-100 p-2 px-6">
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar Novo
                        </Button>
                    </div>
                </div>
            ) : (
                <div ref={listRef}>
                    {chunks.map((chunk, chunkIdx) => {
                        const isVisible = chunkIdx >= windowStart && chunkIdx <= windowEnd
                        const placeholderH = chunk.length > 0
                            ? Math.ceil(chunk.length / 3) * CARD_HEIGHT_PX
                            : 0

                        if (!isVisible) {
                            // Placeholder — maintains scroll position
                            return (
                                <div
                                    key={`placeholder-${chunkIdx}`}
                                    style={{ height: placeholderH }}
                                    aria-hidden="true"
                                />
                            )
                        }

                        return (
                            <div
                                key={`chunk-${chunkIdx}`}
                                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6"
                            >
                                {chunk.map(exercise => (
                                    <ExerciseCard
                                        key={exercise.id}
                                        exercise={exercise}
                                        session={session}
                                        enableVideoHoverPreview={enableVideoHoverPreview}
                                        videoHoverType={videoHoverType}
                                        onEdit={handleOpenModal}
                                        onDelete={(ex) => { setExerciseToDelete(ex); setIsDeleteAlertOpen(true) }}
                                    />
                                ))}
                            </div>
                        )
                    })}

                    {/* Bottom sentinel — triggers load more */}
                    <div ref={sentinelRef} className="h-1" />

                    {/* Loading more indicator */}
                    {loadingMore && (
                        <div className="flex justify-center py-6">
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Carregando mais exercícios...
                            </div>
                        </div>
                    )}

                    {/* End of list */}
                    {!hasMore && allExercises.length > PAGE_SIZE && (
                        <p className="text-center text-xs text-gray-300 py-4">
                            · fim da biblioteca ·
                        </p>
                    )}
                </div>
            )}


            {/* Modal exclusão */}
            <Dialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">Excluir Exercício?</DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja apagar permanentemente o exercício <strong>{exerciseToDelete?.name}</strong>?
                            Isso não afetará treinos passados, mas a IA deixará de usá-lo em novos planos.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setIsDeleteAlertOpen(false)} disabled={saving}>Cancelar</Button>
                        <Button onClick={confirmDelete} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            Sim, excluir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
