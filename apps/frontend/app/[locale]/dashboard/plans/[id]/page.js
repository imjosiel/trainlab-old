'use client'

import { ROLES } from '@/lib/constants'
import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2, CheckCircle2, XCircle, Edit2, Download, ArrowLeft,
  Sparkles, AlertCircle, Plus, Trash2, Calendar, MessageSquare, LibraryBig, Play, PenLine
} from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import R2VideoUpload from '@/components/ui/r2-video-upload'
import ExerciseVideoPreview from '@/components/ui/exercise-video-preview'

const STATUS_LABELS = {
  PENDING: { label: 'Pendente Aprovação', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: AlertCircle },
  APPROVED: { label: 'Aprovado', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle2 },
  REJECTED: { label: 'Rejeitado', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
  DELIVERED: { label: 'Entregue', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Download },
  COMPLETED: { label: 'Concluído', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: CheckCircle2 },
}

export default function PlanDetailsPage() {

  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const planId = params.id

  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editedPlan, setEditedPlan] = useState('')
  const [trainerNotes, setTrainerNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Session manager state
  const [showAddSession, setShowAddSession] = useState(false)
  const [newSession, setNewSession] = useState({ title: '', description: '', day: '', duration: '', exercises: [] })
  const [addingSession, setAddingSession] = useState(false)
  const [deletingSessionId, setDeletingSessionId] = useState(null)

  // Edit Session state
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [editSessionObj, setEditSessionObj] = useState({ title: '', description: '', day: '', duration: '', exercises: [] })
  const [savingEditSession, setSavingEditSession] = useState(false)

  // Quick Edit Exercise Modal
  const [quickEditState, setQuickEditState] = useState(null) // { sessionId, exIndex, ex, exercises }
  const [isSavingQuickEdit, setIsSavingQuickEdit] = useState(false)
  const [saveToLibrary, setSaveToLibrary] = useState(false)
  const [quickEditVideoUrl, setQuickEditVideoUrl] = useState(null)
  const [quickEditVideoKey, setQuickEditVideoKey] = useState(null)
  const [uploadingQEVideo, setUploadingQEVideo] = useState(false)

  // Exercises Library
  const [exercisesLib, setExercisesLib] = useState([])
  const [enableVideoHoverPreview, setEnableVideoHoverPreview] = useState(true)
  const [videoHoverType, setVideoHoverType] = useState('TEASER')
  const [hoveredHoverId, setHoveredHoverId] = useState(null) // Combine sessionId + index to track exact exercise hovered

  const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)

  useEffect(() => {
    fetchPlan()
    if (isTrainer) fetchExercises()
  }, [planId, isTrainer])

  const fetchExercises = async () => {
    try {
      const res = await fetch('/api/backend/exercises')
      if (res.ok) {
        const data = await res.json()
        setExercisesLib(data.exercises || [])
        if (data.enableVideoHoverPreview !== undefined) {
          setEnableVideoHoverPreview(data.enableVideoHoverPreview)
          setVideoHoverType(data.videoHoverType || 'TEASER')
        }
      }
    } catch (err) {
      console.error('Failed to fetch exercises')
    }
  }

  const fetchPlan = async () => {
    try {
      const response = await fetch(`/api/backend/training-plans/${planId}`)
      const data = await response.json()
      
      if (response.ok) {
        setPlan(data.plan)
        setEditedPlan(data.plan.finalPlan || data.plan.aiSuggestion)
        setTrainerNotes(data.plan.trainerNotes || '')
      } else {
        if (response.status === 403 && data.code === 'SUBSCRIPTION_REQUIRED') {
            toast.error(data.error || 'Assinatura Pendente')
            router.push('/dashboard/billing')
        } else {
            toast.error(data.error || 'Plano não encontrado')
            router.push('/dashboard/plans')
        }
      }
    } catch (error) {
      console.error('Error fetching plan:', error)
      toast.error('Erro ao carregar plano')
      router.push('/dashboard/plans')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/backend/training-plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          finalPlan: editedPlan,
          trainerNotes: trainerNotes,
        }),
      })

      if (!response.ok) throw new Error('Erro ao aprovar plano')

      toast.success('Plano aprovado com sucesso!')
      fetchPlan()
      setEditing(false)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!confirm('Tem certeza que deseja rejeitar este plano?')) return

    setActionLoading(true)
    try {
      const response = await fetch(`/api/backend/training-plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'REJECTED',
          trainerNotes: trainerNotes,
        }),
      })

      if (!response.ok) throw new Error('Erro ao rejeitar plano')

      toast.success('Plano rejeitado')
      router.push('/dashboard/plans')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/backend/training-plans/${planId}/pdf`)
      if (!res.ok) throw new Error('Erro ao gerar PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `plano_treino_${planId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF gerado com sucesso!')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDownloading(false)
    }
  }

  const handleAddSession = async (e) => {
    e.preventDefault()
    setAddingSession(true)
    try {
      const res = await fetch(`/api/backend/training-plans/${planId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSession),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao adicionar sessão')
      toast.success('Sessão adicionada!')
      setNewSession({ title: '', description: '', day: '', duration: '', exercises: [] })
      setShowAddSession(false)
      fetchPlan()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAddingSession(false)
    }
  }

  const handleDeleteSession = async (sessionId) => {
    if (!confirm('Remover esta sessão?')) return
    setDeletingSessionId(sessionId)
    try {
      const res = await fetch(`/api/backend/training-plans/sessions/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao remover sessão')
      toast.success('Sessão removida')
      fetchPlan()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeletingSessionId(null)
    }
  }

  const handleEditSessionSubmit = async (e) => {
    e.preventDefault()
    setSavingEditSession(true)
    try {
      const res = await fetch(`/api/backend/training-plans/sessions/${editingSessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editSessionObj),
      })
      if (!res.ok) throw new Error('Erro ao atualizar sessão')
      toast.success('Sessão atualizada!')
      setEditingSessionId(null)
      fetchPlan()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingEditSession(false)
    }
  }

  const appendExerciseToDescription = (exercise, isEditing = false) => {
    // V3: Adiciona o exercício estruturado com TODOS os campos da biblioteca
    // (business_rules §6: exercícios têm mesma estrutura independente da origem)
    const mappedEx = {
      exerciseId:       exercise.id,
      name:             exercise.name,
      description:      exercise.description  ?? '',
      category:         exercise.category     ?? 'Técnico',
      difficulty:       exercise.difficulty   ?? 'Iniciante',
      videoUrl:         exercise.videoUrl     ?? null,
      originalVideoKey: exercise.originalVideoKey ?? null,
      hlsProcessed:     exercise.hlsProcessed ?? false,
      sets:        3,
      reps:        '10',
      restSeconds: 60,
      completed:   false,
    }
    
    if (isEditing) {
      setEditSessionObj(prev => ({ 
        ...prev, 
        exercises: [...(prev.exercises || []), mappedEx] 
      }))
    } else {
      setNewSession(prev => ({ 
        ...prev, 
        exercises: [...(prev.exercises || []), mappedEx] 
      }))
    }
    toast.success('Exercício vinculado à sessão!')
  }

  const updateExerciseDosage = (index, field, value, isEditing = false) => {
    if (isEditing) {
      setEditSessionObj(prev => {
        const newEx = [...prev.exercises]
        newEx[index] = { ...newEx[index], [field]: value }
        return { ...prev, exercises: newEx }
      })
    } else {
      setNewSession(prev => {
        const newEx = [...prev.exercises]
        newEx[index] = { ...newEx[index], [field]: value }
        return { ...prev, exercises: newEx }
      })
    }
  }

  const removeExerciseFromSession = (indexToRemove, isEditing = false) => {
    if (isEditing) {
        setEditSessionObj(prev => ({
            ...prev,
            exercises: prev.exercises.filter((_, idx) => idx !== indexToRemove)
        }))
    } else {
        setNewSession(prev => ({
            ...prev,
            exercises: prev.exercises.filter((_, idx) => idx !== indexToRemove)
        }))
    }
  }

  // Phase 5: Digitalizar Sessão Antiga
  const handleDigitizeSession = async (sessionId, sessionDescription, sessionExercisesArr) => {
    try {
      if (exercisesLib.length === 0) {
        toast.info("Sua biblioteca de vídeos está vazia. Cadastre exercícios na aba Exercícios primeiro.")
        return;
      }
      
      const newExercises = [...sessionExercisesArr]
      let digitizedCount = 0
      
      // Procura nomes compatíveis no texto antigo e atualiza
      newExercises.forEach((ex, idx) => {
        if (!ex.exerciseId) { // É uma pílula v1 só com nome
           const match = exercisesLib.find(libEx => libEx.name.toLowerCase() === ex.name.toLowerCase())
           if (match) {
             newExercises[idx] = { ...ex, exerciseId: match.id, videoUrl: match.videoUrl, sets: 3, reps: '10', restSeconds: 60 }
             digitizedCount++
           }
        }
      })

      if (digitizedCount > 0) {
        const res = await fetch(`/api/backend/training-plans/sessions/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exercises: newExercises }),
        })
        if (!res.ok) throw new Error('Falha ao salvar digitalização.')
        toast.success(`${digitizedCount} vídeo(s) amarrados com sucesso (V3)!`)
        fetchPlan()
      } else {
        toast.warning("Nenhum nome de exercício antigo correspondeu aos nomes na sua Biblioteca atual.")
      }
    } catch(err) {
      toast.error("Erro na conversão: " + err.message)
    }
  }

  const parseExercises = (jsonString) => {
      try {
          return JSON.parse(jsonString) || []
      } catch(e) {
          return []
      }
  }

  const handleOpenQuickEdit = (sessionId, exIndex, ex, allExercises) => {
    if (!canManageSessions) return
    setQuickEditState({ sessionId, exIndex, ex: { ...ex }, exercises: allExercises })
    setSaveToLibrary(!ex.exerciseId) // pre-check only for AI (no library link)
    setQuickEditVideoUrl(null)
    setQuickEditVideoKey(null)
    setUploadingQEVideo(false)
  }

  const handleSaveQuickEdit = async () => {
    if (!quickEditState) return
    setIsSavingQuickEdit(true)
    try {
      const { sessionId, exIndex, ex, exercises } = quickEditState
      let updatedEx = { ...ex }

      // Save to library if checkbox is checked and exercise has no library link
      if (saveToLibrary && !ex.exerciseId) {
        // Validação client-side: description obrigatória (API rejeita vazia)
        if (!ex.description?.trim()) {
          toast.error('Preencha a descrição do exercício antes de salvar na biblioteca.')
          setIsSavingQuickEdit(false)
          return
        }
        const safeCategory   = ex.category?.trim()   || 'Técnico'
        const safeDifficulty = ex.difficulty?.trim()  || 'Intermediário'
        const libRes = await fetch('/api/backend/exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:             ex.name,
            description:      ex.description.trim(),
            category:         safeCategory,
            difficulty:       safeDifficulty,
            videoUrl:         quickEditVideoUrl || null,
            originalVideoKey: quickEditVideoKey || null,
          })
        })
        if (libRes.ok) {
          const libData = await libRes.json()
          updatedEx.exerciseId       = libData.exercise?.id              || null
          updatedEx.videoUrl         = libData.exercise?.videoUrl        || quickEditVideoUrl || null
          updatedEx.originalVideoKey = libData.exercise?.originalVideoKey || quickEditVideoKey || null
          updatedEx.hlsProcessed     = libData.exercise?.hlsProcessed    ?? false
          updatedEx.category         = libData.exercise?.category        || safeCategory
          updatedEx.difficulty       = libData.exercise?.difficulty      || safeDifficulty
          toast.success('Exercício salvo na biblioteca!')
        } else {
          const errData = await libRes.json().catch(() => ({}))
          toast.error('Erro ao salvar na biblioteca: ' + (errData.error || libRes.statusText))
        }
      }


      // Garante que o vídeo uploadado vai para a sessão mesmo se a biblioteca falhou
      if (quickEditVideoUrl && !updatedEx.videoUrl) {
        updatedEx.videoUrl = quickEditVideoUrl
      }

      // Update the exercises array for this session
      const updatedExercises = [...exercises]
      updatedExercises[exIndex] = updatedEx

      const res = await fetch(`/api/backend/training-plans/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercises: updatedExercises })
      })
      if (!res.ok) throw new Error('Erro ao salvar exercício')

      toast.success('Exercício atualizado!')
      setQuickEditState(null)
      fetchPlan()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setIsSavingQuickEdit(false)
    }
  }

  

const getInitials = (name) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    )
  }

  if (!plan) return null

  const StatusIcon = STATUS_LABELS[plan.status].icon
  const canManageSessions = isTrainer && plan.trainerId === session?.user?.id
  const sortedSessions = [...(plan.trainingSessions || [])].sort((a, b) => a.day - b.day)

  const targetName = plan.student?.name || plan.athlete?.name || 'Praticante'
  const targetEmail = plan.student?.user?.email || plan.athlete?.email || 'N/A'
  const targetImage = plan.student?.user?.image || plan.athlete?.image || null

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-8">
      {/* Header */}
      <div>
        <Button variant="ghost" onClick={() => router.push('/dashboard/plans')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{plan.title}</h1>

            <div className="flex items-center space-x-2">
              <Avatar className="h-10 w-10">
                <AvatarImage src={targetImage} />
                <AvatarFallback className="bg-blue-100 text-blue-600">
                  {getInitials(targetName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{targetName}</p>
                <p className="text-sm text-gray-500">{targetEmail}</p>
              </div>
            </div>
          </div>

          <Badge className={`${STATUS_LABELS[plan.status].color} flex items-center`} variant="outline">
            <StatusIcon className="w-4 h-4 mr-1" />
            {STATUS_LABELS[plan.status].label}
          </Badge>
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs">Duração</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{plan.duration}</p>
            <p className="text-xs text-gray-500">dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs">Sessões</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{sortedSessions.length}</p>
            <p className="text-xs text-gray-500">
              {sortedSessions.filter(s => s.completed).length} concluídas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs">Criado em</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{format(new Date(plan.createdAt), 'dd/MM/yyyy')}</p>
            <p className="text-xs text-gray-500">{format(new Date(plan.createdAt), 'HH:mm')}</p>
          </CardContent>
        </Card>

        {plan.approvedAt && (
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="text-xs">Aprovado em</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{format(new Date(plan.approvedAt), 'dd/MM/yyyy')}</p>
              <p className="text-xs text-gray-500">{format(new Date(plan.approvedAt), 'HH:mm')}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pending alert */}
      {isTrainer && plan.status === 'PENDING' && !plan.isManual && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            Este plano foi gerado pela IA e aguarda sua aprovação. Você pode editar o conteúdo, adicionar sessões e incluir observações antes de aprovar.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="plan">
        <TabsList>
          <TabsTrigger value="plan">
            <Sparkles className="w-4 h-4 mr-2" />
            Plano de Treino
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <Calendar className="w-4 h-4 mr-2" />
            Sessões ({sortedSessions.length})
          </TabsTrigger>
          {plan.trainerNotes && (
            <TabsTrigger value="notes">
              <MessageSquare className="w-4 h-4 mr-2" />
              Observações
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Tab: Plano de Treino ── */}
        <TabsContent value="plan" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{editing ? 'Editar Plano' : 'Plano de Treino'}</CardTitle>
                {isTrainer && plan.status === 'PENDING' && !editing && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Editar
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {editing ? (
                <Textarea
                  value={editedPlan}
                  onChange={(e) => setEditedPlan(e.target.value)}
                  rows={25}
                  className="font-mono text-sm"
                />
              ) : (
                <div className="prose max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {plan.finalPlan || plan.aiSuggestion}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trainer Notes editor (visible only while pending/editing) */}
          {isTrainer && (plan.status === 'PENDING' || editing) && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Observações do Treinador</CardTitle>
                <CardDescription>
                  Visíveis para o praticante após a aprovação do plano
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={trainerNotes}
                  onChange={(e) => setTrainerNotes(e.target.value)}
                  rows={4}
                  placeholder="Ex: Atenção especial ao joelho direito. Evitar impacto alto nos primeiros 7 dias."
                />
              </CardContent>
            </Card>
          )}

          {/* Action buttons (trainer, pending) */}
          {isTrainer && plan.status === 'PENDING' && (
            <div className="flex justify-end space-x-4 mt-6">
              {editing && (
                <Button
                  variant="outline"
                  onClick={() => { setEditing(false); setEditedPlan(plan.finalPlan || plan.aiSuggestion) }}
                  disabled={actionLoading}
                >
                  Cancelar
                </Button>
              )}

              <Button
                variant="outline"
                onClick={handleReject}
                disabled={actionLoading}
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                Rejeitar
              </Button>

              <Button onClick={handleApprove} disabled={actionLoading} className="bg-green-600 hover:bg-green-700">
                {actionLoading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...</>
                  : <><CheckCircle2 className="mr-2 h-4 w-4" /> Aprovar e Entregar</>}
              </Button>
            </div>
          )}

          {/* Download PDF */}
          {(plan.status === 'APPROVED' || plan.status === 'DELIVERED' || plan.status === 'COMPLETED') && (
            <div className="mt-6">
              <Button variant="outline" className="w-full" onClick={handleDownloadPDF} disabled={downloading}>
                {downloading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando PDF...</>
                  : <><Download className="mr-2 h-4 w-4" /> Baixar PDF</>}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Sessões ── */}
        <TabsContent value="sessions" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Sessões de Treino</h2>
              <p className="text-sm text-gray-500">
                {sortedSessions.filter(s => s.completed).length} de {sortedSessions.length} concluídas
              </p>
            </div>
            {canManageSessions && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => setShowAddSession(v => !v)}
              >
                <Plus className="w-4 h-4 mr-1" />
                {showAddSession ? 'Cancelar' : 'Adicionar Sessão'}
              </Button>
            )}
          </div>

          {/* Add session form */}
          {showAddSession && canManageSessions && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Nova Sessão</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddSession} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="sess-title">Título *</Label>
                      <Input
                        id="sess-title"
                        value={newSession.title}
                        onChange={e => setNewSession(p => ({ ...p, title: e.target.value }))}
                        placeholder="Ex: Treino de Velocidade"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="sess-day">Dia *</Label>
                      <Input
                        id="sess-day"
                        type="number"
                        min="1"
                        max="365"
                        value={newSession.day}
                        onChange={e => setNewSession(p => ({ ...p, day: e.target.value }))}
                        placeholder="Ex: 1"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label htmlFor="sess-desc">Descrição</Label>
                      {exercisesLib.length > 0 && (
                        <select
                          className="text-xs border rounded p-1 bg-white text-gray-700"
                          title="Vincular Exercício com Vídeo"
                          onChange={(e) => {
                            if (!e.target.value) return
                            const ex = exercisesLib.find(x => x.id === e.target.value)
                            if (ex) appendExerciseToDescription(ex, false)
                            e.target.value = ''
                          }}
                        >
                          <option value="">+ Vincular da Biblioteca Real</option>
                          {exercisesLib.map(ex => (
                            <option key={ex.id} value={ex.id}>{ex.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {/* Render Selected Exercises (Add Session) V3 */}
                    {newSession.exercises && newSession.exercises.length > 0 && (
                      <div className="flex flex-col gap-3 mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-inner">
                        <Label className="text-[10px] uppercase font-extrabold text-gray-400 mb-1">Exercícios Agendados</Label>
                        {newSession.exercises.map((ex, idx) => (
                           <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col gap-3 relative animate-in fade-in slide-in-from-top-2 duration-300">
                             <div className="flex justify-between items-center">
                               <div className="flex items-center gap-2">
                                 <div className="w-7 h-7 rounded bg-green-50 flex items-center justify-center">
                                   <LibraryBig className="w-4 h-4 text-green-600" />
                                 </div>
                                 <span className="text-sm font-bold text-gray-800">{ex.name}</span>
                               </div>
                               <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50"
                                  onClick={() => removeExerciseFromSession(idx, false)}
                               >
                                 <XCircle className="w-4 h-4" />
                               </Button>
                             </div>
                             <div className="grid grid-cols-3 gap-3">
                               <div className="space-y-1">
                                 <Label className="text-[9px] uppercase text-gray-500 font-bold">Séries</Label>
                                 <Input type="number" min="1" className="h-8 text-xs font-bold" value={ex.sets || 3} onChange={e => updateExerciseDosage(idx, 'sets', parseInt(e.target.value), false)} />
                               </div>
                               <div className="space-y-1">
                                 <Label className="text-[9px] uppercase text-gray-500 font-bold">Reps/Tempo</Label>
                                 <Input type="text" className="h-8 text-xs font-bold" value={ex.reps || '10'} onChange={e => updateExerciseDosage(idx, 'reps', e.target.value, false)} placeholder="10 ou 45s" />
                               </div>
                               <div className="space-y-1">
                                 <Label className="text-[9px] uppercase text-gray-500 font-bold">Descanso (s)</Label>
                                 <Input type="number" min="0" step="5" className="h-8 text-xs font-bold" value={ex.restSeconds || 60} onChange={e => updateExerciseDosage(idx, 'restSeconds', parseInt(e.target.value), false)} />
                               </div>
                             </div>
                           </div>
                        ))}
                      </div>
                    )}
                    <Textarea
                      id="sess-desc"
                      value={newSession.description}
                      onChange={e => setNewSession(p => ({ ...p, description: e.target.value }))}
                      placeholder="Descreva a rotina caso queira complementar com texto os exercícios vinculados acima..."
                      rows={5}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="sess-dur">Duração (min)</Label>
                      <Input
                        id="sess-dur"
                        type="number"
                        min="5"
                        max="300"
                        value={newSession.duration}
                        onChange={e => setNewSession(p => ({ ...p, duration: e.target.value }))}
                        placeholder="Ex: 60"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowAddSession(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" size="sm" className="bg-green-600 hover:bg-green-700" disabled={addingSession}>
                      {addingSession ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                      Adicionar
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Sessions list */}
          {sortedSessions.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Nenhuma sessão cadastrada ainda.</p>
                {canManageSessions && (
                  <p className="text-gray-400 text-xs mt-1">Use o botão acima para adicionar sessões manualmente.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Accordion type="single" collapsible className="w-full space-y-3">
              {sortedSessions.map(s => (
                <AccordionItem 
                  key={s.id} 
                  value={s.id}
                  className={`border rounded-lg overflow-hidden ${s.completed ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-white shadow-sm'}`}
                >
                  <div className="flex items-center px-4 py-1">
                    <div className="mr-3">
                      {s.completed
                        ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                        : <div className="w-5 h-5 rounded-full border-2 border-gray-300" />}
                    </div>
                    <AccordionTrigger className="flex-1 hover:no-underline py-3 px-0">
                      <div className="flex flex-1 items-center justify-between text-left pr-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] uppercase font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-100">
                             Dia {s.day}
                            </span>
                            {s.duration && <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">⏱ {s.duration} min</span>}
                          </div>
                          <h3 className={`font-semibold text-sm truncate ${s.completed ? 'text-green-800 line-through' : 'text-gray-900'}`}>
                            {s.title}
                          </h3>
                        </div>
                      </div>
                    </AccordionTrigger>
                    
                    {canManageSessions && !s.completed && editingSessionId !== s.id && (
                      <div className="flex items-center gap-2 ml-auto pr-2 border-l pl-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSessionId(s.id)
                            setEditSessionObj({ 
                              title: s.title, 
                              day: s.day, 
                              duration: s.duration, 
                              description: s.description || '',
                              exercises: parseExercises(s.exercises)
                            })
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
                          title="Editar sessão"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(s.id)
                          }}
                          disabled={deletingSessionId === s.id}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                          title="Remover sessão"
                        >
                          {deletingSessionId === s.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                  </div>

                  <AccordionContent className="px-4 pb-4 pt-2 border-t bg-gray-50/50">
                    {editingSessionId === s.id ? (
                      <div className="bg-white border border-blue-200 rounded-lg p-4 shadow-sm mt-2">
                        <form onSubmit={handleEditSessionSubmit} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label className="text-xs">Título da Sessão *</Label>
                              <Input value={editSessionObj.title} onChange={e => setEditSessionObj(p => ({ ...p, title: e.target.value }))} required className="h-9" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Dia do Plano *</Label>
                              <Input type="number" value={editSessionObj.day} onChange={e => setEditSessionObj(p => ({ ...p, day: e.target.value }))} required className="h-9" />
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs">Complemento Textual</Label>
                            <Textarea 
                                value={editSessionObj.description} 
                                onChange={e => setEditSessionObj(p => ({ ...p, description: e.target.value }))} 
                                placeholder="Notas adicionais para o aluno..." 
                                rows={3}
                                className="resize-none"
                            />
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-bold text-gray-700">💊 Exercícios Estruturados (V3)</Label>
                              {exercisesLib.length > 0 && (
                                <select
                                  className="text-[10px] border rounded bg-white text-gray-600 px-2 py-1"
                                  onChange={(e) => {
                                    if (!e.target.value) return
                                    const ex = exercisesLib.find(x => x.id === e.target.value)
                                    if (ex) appendExerciseToDescription(ex, true)
                                    e.target.value = ''
                                  }}
                                >
                                  <option value="">+ Adicionar da Biblioteca</option>
                                  {exercisesLib.map(ex => (
                                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                                  ))}
                                </select>
                              )}
                            </div>

                            {editSessionObj.exercises && editSessionObj.exercises.length > 0 ? (
                              <div className="grid grid-cols-1 gap-3 border rounded-lg p-3 bg-gray-100/50">
                                {editSessionObj.exercises.map((ex, idx) => (
                                   <div key={idx} className="bg-white p-3 rounded-md border border-gray-200 shadow-sm flex flex-col gap-3 relative">
                                     <div className="flex justify-between items-start">
                                       <div className="flex items-center gap-2">
                                          <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
                                            <LibraryBig className="w-4 h-4 text-blue-600" />
                                          </div>
                                          <span className="text-sm font-bold text-gray-800">{ex.name}</span>
                                       </div>
                                       <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-7 w-7 text-gray-400 hover:text-red-500"
                                          onClick={() => removeExerciseFromSession(idx, true)}
                                       >
                                         <XCircle className="w-4 h-4" />
                                       </Button>
                                     </div>
                                     <div className="grid grid-cols-3 gap-3">
                                       <div className="space-y-1">
                                         <Label className="text-[10px] uppercase text-gray-500 font-bold">Séries</Label>
                                         <Input type="number" min="1" className="h-8 text-xs font-bold" value={ex.sets || 3} onChange={e => updateExerciseDosage(idx, 'sets', parseInt(e.target.value), true)} />
                                       </div>
                                       <div className="space-y-1">
                                         <Label className="text-[10px] uppercase text-gray-500 font-bold">Reps/Tempo</Label>
                                         <Input type="text" className="h-8 text-xs font-bold" value={ex.reps || '10'} onChange={e => updateExerciseDosage(idx, 'reps', e.target.value, true)} placeholder="10 ou 45s" />
                                       </div>
                                       <div className="space-y-1">
                                         <Label className="text-[10px] uppercase text-gray-500 font-bold">Pausa (s)</Label>
                                         <Input type="number" min="0" step="5" className="h-8 text-xs font-bold" value={ex.restSeconds || 60} onChange={e => updateExerciseDosage(idx, 'restSeconds', parseInt(e.target.value), true)} />
                                       </div>
                                     </div>
                                   </div>
                                ))}
                              </div>
                            ) : (
                                <p className="text-[11px] text-gray-400 italic text-center py-2">Nenhum exercício pautado para hoje.</p>
                            )}
                          </div>

                          <div className="flex justify-end gap-2 pt-2 border-t">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingSessionId(null)}>Descartar</Button>
                            <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-2" disabled={savingEditSession}>
                              {savingEditSession ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                              Atualizar Sessão
                            </Button>
                          </div>
                        </form>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {s.description && (
                          <div className="bg-white p-3 rounded-lg border border-gray-100 text-sm text-gray-600 leading-relaxed shadow-sm">
                            {s.description}
                          </div>
                        )}
                        
                        <div className="space-y-2">
                           <h4 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Exercícios Sugeridos</h4>
                           {parseExercises(s.exercises).length > 0 ? (
                             <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {parseExercises(s.exercises).map((ex, idx) => {
                                  const isLegacy = !ex.exerciseId && !ex.sets && !ex.description && !ex.notes;
                                   const isAIRich = !ex.exerciseId && !!(ex.sets || ex.description || ex.notes);  // V3 IA: tem sets mas pode não ter description ainda
                                  const uniqueHoverId = `${s.id}-${idx}`;

                                  const isHovered = hoveredHoverId === uniqueHoverId && enableVideoHoverPreview;

                                  return (
                                    <div 
                                      key={idx} 
                                      className={`flex flex-col group overflow-hidden transition-all hover:shadow-md border rounded-xl cursor-pointer ${isLegacy ? 'bg-orange-50/50 border-orange-200' : isAIRich ? 'bg-blue-50/30 border-blue-100' : 'bg-white border-gray-200'}`}
                                      onMouseEnter={() => setHoveredHoverId(uniqueHoverId)}
                                      onMouseLeave={() => setHoveredHoverId(null)}
                                      onClick={() => canManageSessions && !s.completed && handleOpenQuickEdit(s.id, idx, ex, parseExercises(s.exercises))}
                                    >
                                      {/* Video/Thumb Container */}
                                      <div className="relative aspect-video bg-gray-100 overflow-hidden border-b">
                                          {isLegacy ? (
                                              <div className="w-full h-full flex flex-col items-center justify-center text-orange-400 bg-orange-50">
                                                  <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                                                  <span className="text-[10px] font-semibold opacity-70 uppercase tracking-wider text-center px-2">Legado (Texto)</span>
                                              </div>
                                          ) : (
                                              <ExerciseVideoPreview
                                                  exercise={ex}
                                                  enableVideoHoverPreview={enableVideoHoverPreview}
                                                  videoHoverType={videoHoverType}
                                                  isHovered={isHovered}
                                              />
                                          )}
                                          {/* Badge overlay: IA sem vídeo ainda */}
                                          {!isLegacy && !ex.videoUrl && !ex.exerciseId && (
                                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-50/80 backdrop-blur-[1px] pointer-events-none">
                                                  <Sparkles className="w-6 h-6 mb-1.5 text-blue-400 opacity-70" />
                                                  <span className="text-[10px] font-semibold text-blue-500 opacity-80 uppercase tracking-wider text-center px-2">Gerado por IA</span>
                                              </div>
                                          )}
                                          {isLegacy && (
                                              <div className="absolute top-2 right-2 flex gap-1">
                                                  <Badge className="text-[8px] h-4 bg-orange-100 text-orange-700 hover:bg-orange-100 border-none shadow-sm">V1</Badge>
                                              </div>
                                          )}
                                      </div>

                                      <div className="p-4 pt-3 flex-1 flex flex-col justify-between">
                                          <div>
                                              <h5 className="font-bold text-sm leading-tight transition-colors text-gray-900 group-hover:text-green-700 line-clamp-2" title={ex.name}>
                                                  {ex.name}
                                              </h5>
                                              {(ex.description || ex.notes) && (
                                                <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed line-clamp-3">
                                                  {ex.description || ex.notes}
                                                </p>
                                              )}
                                              {!isLegacy ? (
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                                                        {ex.sets} Séries
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                                                        {ex.reps} Reps
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                                                        {ex.restSeconds}s Pausa
                                                    </div>
                                                    {ex.difficulty && (
                                                      <div className="flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                                                        {ex.difficulty}
                                                      </div>
                                                    )}
                                                </div>
                                              ) : (
                                                <p className="text-[10px] text-orange-600 font-medium mt-3">Sessão formatada em texto. Digitalize com 1 clique.</p>
                                              )}
                                              {isAIRich && ex.notes && ex.description && (
                                                <p className="text-[10px] text-blue-600 italic mt-1.5 line-clamp-2">💡 {ex.notes}</p>
                                              )}
                                          </div>
                                      </div>
                                    </div>
                                  );
                                })}
                             </div>
                           ) : (
                             <div className="text-center py-6 border-2 border-dashed rounded-xl border-gray-100">
                                <p className="text-xs text-gray-400">Nenhum exercício vinculado.</p>
                             </div>
                           )}
                        </div>

                        {/* V1 -> V3: Botão de Migração Automática — só se existir V1 legado genuíno (sem sets, sem description, sem exerciseId) */}
                        {canManageSessions && !s.completed && parseExercises(s.exercises).some(e => !e.exerciseId && !e.sets && !e.description) && (
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="w-full bg-orange-100 text-orange-800 hover:bg-orange-200 border border-orange-200 shadow-sm py-5"
                            onClick={() => handleDigitizeSession(s.id, s.description, parseExercises(s.exercises))}
                          >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Digitalizar Sessão (Auto-Link Exercícios V3)
                          </Button>
                        )}

                        {s.athleteFeedback && (
                          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3">
                             <h5 className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter mb-1 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> Feedback do Aluno
                             </h5>
                             <p className="text-xs text-blue-700 italic leading-relaxed">"{s.athleteFeedback}"</p>
                          </div>
                        )}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </TabsContent>

        {/* ── Tab: Observações ── */}
        {plan.trainerNotes && (
          <TabsContent value="notes" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                  Observações do Treinador
                </CardTitle>
                {plan.trainer && (
                  <CardDescription>por {plan.trainer.name}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900 whitespace-pre-wrap">{plan.trainerNotes}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ── Quick Edit Exercise Modal ── */}
      {quickEditState && (
        <Dialog open={!!quickEditState} onOpenChange={(open) => !open && setQuickEditState(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PenLine className="w-4 h-4 text-green-600" />
                Editar Exercício
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nome</Label>
                <Input
                  value={quickEditState.ex.name || ''}
                  onChange={e => setQuickEditState(p => ({ ...p, ex: { ...p.ex, name: e.target.value } }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Descrição (instrução de execução)</Label>
                <Textarea
                  rows={3}
                  className="resize-none text-sm"
                  value={quickEditState.ex.description || ''}
                  onChange={e => setQuickEditState(p => ({ ...p, ex: { ...p.ex, description: e.target.value } }))}
                  placeholder="Como executar: posição inicial, movimento, finalização..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Categoria</Label>
                  <Select
                    value={quickEditState.ex.category || ''}
                    onValueChange={v => setQuickEditState(p => ({ ...p, ex: { ...p.ex, category: v } }))}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Técnico">Técnico</SelectItem>
                      <SelectItem value="Físico">Físico</SelectItem>
                      <SelectItem value="Tático">Tático</SelectItem>
                      <SelectItem value="Mental">Mental</SelectItem>
                      <SelectItem value="Aquecimento">Aquecimento</SelectItem>
                      <SelectItem value="Recuperação">Recuperação</SelectItem>
                      <SelectItem value="Finalização">Finalização</SelectItem>
                      <SelectItem value="Goleiro">Goleiro</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Dificuldade</Label>
                  <Select
                    value={quickEditState.ex.difficulty || ''}
                    onValueChange={v => setQuickEditState(p => ({ ...p, ex: { ...p.ex, difficulty: v } }))}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Iniciante">Iniciante</SelectItem>
                      <SelectItem value="Intermediário">Intermediário</SelectItem>
                      <SelectItem value="Avançado">Avançado</SelectItem>
                      <SelectItem value="Profissional">Profissional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Séries</Label>
                  <Input type="number" min="1" className="h-9 text-sm font-bold"
                    value={quickEditState.ex.sets || 3}
                    onChange={e => setQuickEditState(p => ({ ...p, ex: { ...p.ex, sets: parseInt(e.target.value) } }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Reps/Tempo</Label>
                  <Input type="text" className="h-9 text-sm font-bold"
                    value={quickEditState.ex.reps || '10'}
                    onChange={e => setQuickEditState(p => ({ ...p, ex: { ...p.ex, reps: e.target.value } }))}
                    placeholder="10 ou 45s"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Descanso (s)</Label>
                  <Input type="number" min="0" step="5" className="h-9 text-sm font-bold"
                    value={quickEditState.ex.restSeconds || 60}
                    onChange={e => setQuickEditState(p => ({ ...p, ex: { ...p.ex, restSeconds: parseInt(e.target.value) } }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">💡 Dica do Treinador</Label>
                <Input
                  value={quickEditState.ex.notes || ''}
                  onChange={e => setQuickEditState(p => ({ ...p, ex: { ...p.ex, notes: e.target.value } }))}
                  placeholder="Dica técnica personalizada..."
                />
              </div>
              {!quickEditState.ex.exerciseId && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-green-50 border border-green-100">
                  <Checkbox
                    id="saveToLib"
                    checked={saveToLibrary}
                    onCheckedChange={setSaveToLibrary}
                    className="border-green-400 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                  />
                  <label htmlFor="saveToLib" className="text-sm text-green-800 font-medium cursor-pointer select-none flex-1">
                    Salvar como novo exercício na biblioteca
                    <span className="block text-[10px] text-green-600 font-normal">Ficará disponível para outros planos</span>
                  </label>
                  <LibraryBig className="w-4 h-4 text-green-600 shrink-0" />
                </div>
              )}
              {!quickEditState.ex.exerciseId && saveToLibrary && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-xs font-bold">📹 Vídeo para a Biblioteca (opcional)</Label>
                  {quickEditVideoUrl ? (
                    <div className="p-3 border border-green-200 rounded-lg bg-green-50 flex items-center justify-between">
                      <span className="text-xs text-green-700 font-medium">✓ Vídeo pronto</span>
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setQuickEditVideoUrl(null); setQuickEditVideoKey(null) }}>Remover</Button>
                    </div>
                  ) : (
                    <R2VideoUpload
                      onProcessingChange={setUploadingQEVideo}
                      onUploadComplete={(result) => {
                        setQuickEditVideoUrl(result.videoUrl)
                        setQuickEditVideoKey(result.originalKey || null)
                      }}
                    />
                  )}
                </div>
              )}
              {quickEditState.ex.exerciseId && (
                <p className="text-[11px] text-gray-400 italic">✓ Vinculado à biblioteca. Edições aqui são locais a esta sessão.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setQuickEditState(null)} disabled={uploadingQEVideo}>Cancelar</Button>
              <Button onClick={handleSaveQuickEdit} disabled={isSavingQuickEdit || uploadingQEVideo} className="bg-green-600 hover:bg-green-700 gap-2">
                {isSavingQuickEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {uploadingQEVideo ? 'Enviando vídeo...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}