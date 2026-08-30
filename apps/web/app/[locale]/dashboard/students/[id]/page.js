'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import {
    Loader2, ArrowLeft, Plus, FileText, User, Activity, AlertCircle,
    CheckCircle2, Clock, Download, XCircle, Trash2, Trophy, TrendingUp, MessageSquare, Target, StickyNote
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { ROLES, PLAN_STATUS } from '@/lib/constants'

export default function StudentDetailPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const params = useParams()
    const studentId = params.id
    const t = useTranslations('AthleteDetailPage')
    const locale = useLocale()

    const STATUS_LABELS = {
        [PLAN_STATUS.PENDING]:   { label: t('labelPending'),   color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: AlertCircle },
        [PLAN_STATUS.APPROVED]:  { label: t('labelApproved'),  color: 'bg-green-100 text-green-800 border-green-200',   icon: CheckCircle2 },
        [PLAN_STATUS.REJECTED]:  { label: t('labelRejected'),  color: 'bg-red-100 text-red-800 border-red-200',         icon: XCircle },
        [PLAN_STATUS.DELIVERED]: { label: t('labelDelivered'), color: 'bg-blue-100 text-blue-800 border-blue-200',      icon: Download },
        [PLAN_STATUS.COMPLETED]: { label: t('labelCompleted'), color: 'bg-purple-100 text-purple-800 border-purple-200',icon: CheckCircle2 },
    }

    const [student, setStudent] = useState(null)
    const [plans, setPlans] = useState([])
    const [loading, setLoading] = useState(true)
    const [removing, setRemoving] = useState(false)
    const [inviteEmail, setInviteEmail] = useState('')
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
    const [inviting, setInviting] = useState(false)

    const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)

    useEffect(() => {
        if (session && !isTrainer) {
            router.push('/dashboard')
            return
        }
        if (session) fetchStudentData()
    }, [session, studentId])

    const fetchStudentData = async () => {
        try {
            const res = await fetch(`/api/backend/students/${studentId}`)
            if (!res.ok) {
                toast.error(t('errorNotFound'))
                router.push('/dashboard/students')
                return
            }
            const data = await res.json()
            setStudent(data.student)
            setPlans(data.plans || [])
        } catch (error) {
            console.error('Error fetching student data:', error)
            toast.error(t('errorLoadData'))
        } finally {
            setLoading(false)
        }
    }

    const handleSendInvite = async () => {
        if (!inviteEmail) {
            toast.error('Digite um email válido')
            return
        }
        setInviting(true)
        try {
            const res = await fetch(`/api/backend/students/${studentId}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            toast.success(data.message)
            setIsInviteDialogOpen(false)
            setInviteEmail('')
            fetchStudentData() // Refresh student data to reflect pending email
        } catch (error) {
            toast.error(error.message || 'Erro ao enviar convite')
        } finally {
            setInviting(false)
        }
    }

    const handleRemoveStudent = async () => {
        if (!confirm(`Remover ${student.name} da sua lista de alunos?`)) return
        setRemoving(true)
        try {
            const res = await fetch(`/api/backend/students/${studentId}`, { method: 'DELETE' })
            if (!res.ok) throw new Error(t('errorRemove'))
            toast.success(t('successRemove'))
            router.push('/dashboard/students')
        } catch (err) {
            toast.error(err.message || t('errorRemove'))
            setRemoving(false)
        }
    }

    const getInitials = (name) => {
        if (!name) return '?'
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
        )
    }

    if (!student) return null

    const profiles = student.profiles || []
    const profile = profiles[0] // Fallback for some badges if needed
    const totalPlans = plans.length
    const completedPlans = plans.filter(p => p.status === PLAN_STATUS.COMPLETED).length
    const activePlan = plans.find(p => p.status === PLAN_STATUS.APPROVED || p.status === PLAN_STATUS.DELIVERED)
    const completionRate = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0

    return (
        <div className="space-y-6 max-w-4xl pb-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => router.push('/dashboard/students')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t('btnBack')}
                </Button>
                <div className="flex gap-2">
                    {/* Link Account Flow */}
                    {!student.userId && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-blue-200 text-blue-600 hover:bg-blue-50"
                            onClick={() => setIsInviteDialogOpen(true)}
                        >
                            <MessageSquare className="w-4 h-4 mr-1" />
                            Vincular Conta
                        </Button>
                    )}

                    <Button
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                        onClick={handleRemoveStudent}
                        disabled={removing}
                    >
                        {removing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                        {removing ? t('btnRemoving') : t('btnRemoveAthlete')}
                    </Button>
                </div>
            </div>

            {/* Invite Modal (Simple Tailwind Overlay) */}
            {isInviteDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95">
                        <h2 className="text-xl font-bold mb-2">Vincular Conta</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Digite o e-mail do aluno. Se ele já tiver conta, os perfis serão unificados assim que ele aceitar o convite pela aba de notificações ou via e-mail.
                        </p>
                        <input
                            type="email"
                            className="w-full flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent mb-4"
                            placeholder="email@atleta.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSendInvite}
                                disabled={inviting || !inviteEmail}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {inviting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                Enviar Convite
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Student header card */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                            <Avatar className="h-16 w-16">
                                <AvatarImage src={student.image} />
                                <AvatarFallback className="bg-purple-100 text-purple-600 text-lg">
                                    {getInitials(student.name)}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>

                                <div className="flex items-center gap-2 mt-1 mb-1">
                                    <p className="text-gray-500 text-sm">{student.email || 'Nenhum e-mail vinculado'}</p>
                                    {student.email && !student.userId && (
                                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                            Aguardando aceite do Atleta
                                        </Badge>
                                    )}
                                </div>

                                <div className="flex gap-2 mt-2 flex-wrap">
                                    {profiles.map(p => (
                                        <Badge key={p.id} variant="outline" className="capitalize mr-1">
                                            {p.sport?.name} - {p.position || '?'}
                                        </Badge>
                                    ))}
                                    {profiles.length === 0 && (
                                        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200" variant="outline">
                                            {t('badgeIncomplete')}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="border-purple-200 text-purple-700 hover:bg-purple-50"
                                onClick={() => router.push(`/dashboard/students/${studentId}/edit`)}
                            >
                                Ficha Clínica
                            </Button>
                            <Button
                                variant="outline"
                                className="border-amber-200 text-amber-700 hover:bg-amber-50"
                                onClick={() => router.push(`/dashboard/students/${studentId}/notes`)}
                            >
                                <StickyNote className="mr-2 h-4 w-4" />
                                Anotações RAG
                            </Button>
                            <Button
                                className="bg-purple-600 hover:bg-purple-700"
                                onClick={() => router.push(`/dashboard/plans/create?studentId=${studentId}`)}
                                disabled={profiles.length === 0}
                                title={profiles.length === 0 ? t('tooltipCreatePlan') : ''}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                {t('btnCreatePlan')}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Active plan progress (inline) */}
            {activePlan && (
                <Card className="border-purple-200 bg-purple-50">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-purple-800 flex items-center gap-1">
                                <TrendingUp className="w-4 h-4" /> {t('activePlanTitle')}
                            </CardTitle>
                            <span className="text-lg font-bold text-purple-700">{activePlan.progress?.percent ?? 0}%</span>
                        </div>
                        <CardDescription className="text-purple-700 truncate">{activePlan.title}</CardDescription>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <Progress value={activePlan.progress?.percent ?? 0} className="h-2 bg-purple-200" />
                        <p className="text-xs text-purple-600 mt-1">
                            {t('sessionsCompletedOf', { completed: activePlan.progress?.completed ?? 0, total: activePlan.progress?.total ?? 0 })}
                        </p>
                    </CardContent>
                </Card>
            )}

            <div className="grid md:grid-cols-3 gap-6">
                {/* Left column */}
                <div className="md:col-span-1 space-y-4">
                    {/* Profile summaries */}
                    {profiles.length > 0 ? (
                        <>
                            <Card className="mb-4">
                                <CardHeader className="flex flex-row justify-between pb-2 mb-2">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Activity className="w-4 h-4 text-purple-600" />
                                        Dados Clínicos e Pessoais
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {profile.age && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">{t('labelAge') || 'Idade'}</span>
                                            <span className="font-medium">{t('yearsOld', { age: profile.age }) || `${profile.age} anos`}</span>
                                        </div>
                                    )}
                                    {profile.height && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">{t('labelHeight') || 'Altura'}</span>
                                            <span className="font-medium">{profile.height} cm</span>
                                        </div>
                                    )}
                                    {profile.weight && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">{t('labelWeight') || 'Peso'}</span>
                                            <span className="font-medium">{profile.weight} kg</span>
                                        </div>
                                    )}
                                    {profile.currentInjuries && !['nenhuma', 'nenhum', 'nao', 'não', 'none', '-', '.'].includes(profile.currentInjuries.trim().toLowerCase()) && (
                                        <div className="pt-2 border-t border-gray-100">
                                            <p className="text-xs text-red-600 mb-1">{t('labelInjuries') || 'Lesões Atuais'}</p>
                                            <p className="text-xs text-red-800 bg-red-50 rounded p-2">{profile.currentInjuries}</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>



                            {profiles.map(p => (
                                <Card key={p.id} className="mb-4">
                                    <CardHeader className="flex flex-row justify-between pb-2 mb-2 bg-gray-50 border-b">
                                        <CardTitle className="text-base flex items-center gap-2 capitalize">
                                            <User className="w-4 h-4 text-purple-600" />
                                            {p.sport?.name || 'Perfil'}
                                        </CardTitle>
                                        <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/students/${studentId}/edit?sportId=${p.sportId}`)}>
                                            Editar
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="space-y-3 pt-3">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Posição Principal</span>
                                            <span className="font-medium capitalize">{p.position || '?'}</span>
                                        </div>
                                        {p.yearsPlaying && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">{t('labelExperience') || 'Tempo de Prática'}</span>
                                                <span className="font-medium">{p.yearsPlaying} anos</span>
                                            </div>
                                        )}
                                        {p.dominantFoot && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">{t('labelDominantFoot') || 'Pé/Mão Dominante'}</span>
                                                <span className="font-medium capitalize">{p.dominantFoot}</span>
                                            </div>
                                        )}
                                        {p.technicalLevel && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">Nível Técnico</span>
                                                <span className="font-medium capitalize">{p.technicalLevel}</span>
                                            </div>
                                        )}
                                        {p.teams && p.teams.length > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">{t('labelTeam') || 'Times'}</span>
                                                <span className="font-medium text-right max-w-[200px] truncate" title={p.teams.map(t => t.name).join(', ')}>
                                                    {p.teams.map(t => t.name).join(', ')}
                                                </span>
                                            </div>
                                        )}

                                        <div className="mt-4 pt-3 border-t border-purple-100">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Target className="w-4 h-4 text-purple-600" />
                                                <h4 className="text-xs font-semibold text-gray-800 uppercase tracking-wider">{t('titleGoals') || 'Objetivos de Treino'}</h4>
                                            </div>

                                            {p.goals && (
                                                <div className="mb-2">
                                                    <p className="text-xs text-gray-600 mb-1">{t('labelGoals') || 'Objetivo Específico'}</p>
                                                    <p className="text-xs text-gray-800 bg-gray-50 rounded p-2 italic">"{p.goals}"</p>
                                                </div>
                                            )}

                                            {p.trainingDaysPerWeek && (
                                                <div className="flex justify-between text-sm mb-1">
                                                    <span className="text-gray-600">{t('labelAvailability') || 'Dias Disponíveis'}</span>
                                                    <span className="font-medium">{p.trainingDaysPerWeek}x na semana</span>
                                                </div>
                                            )}

                                            {p.trainingHoursPerDay && (
                                                <div className="flex justify-between text-sm mb-2">
                                                    <span className="text-gray-600">Horas por Dia</span>
                                                    <span className="font-medium">{p.trainingHoursPerDay}h</span>
                                                </div>
                                            )}

                                            {p.trainingFocus && p.trainingFocus.length > 0 && (
                                                <div className="pt-2">
                                                    <p className="text-xs text-gray-600 mb-2">Focos de Treino</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {p.trainingFocus.map((f, i) => (
                                                            <Badge key={i} className="bg-purple-100 text-purple-800" variant="outline">{f}</Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </>
                    ) : (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <User className="w-4 h-4 text-purple-600" />
                                    {t('titleProfile')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-center py-4">
                                    <Activity className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500 mb-4">{t('emptyProfile')}</p>
                                    <div className="flex justify-center flex-col items-center">
                                        <span className="text-xs text-red-500 mb-2">Preencha os dados do aluno para a IA elaborar treinos</span>
                                        <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/students/${studentId}/edit`)}>
                                            Ficha Clínica
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Performance stats */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">{t('titlePerformance')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">{t('statTotalPlans')}</span>
                                <span className="font-bold">{totalPlans}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">{t('statApprovedDelivered')}</span>
                                <span className="font-bold text-purple-600">
                                    {plans.filter(p => p.status === PLAN_STATUS.APPROVED || p.status === PLAN_STATUS.DELIVERED).length}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600 flex items-center gap-1">
                                    <Trophy className="w-3 h-3 text-yellow-500" /> {t('statCompleted')}
                                </span>
                                <span className="font-bold text-purple-600">{completedPlans}</span>
                            </div>
                            {totalPlans > 0 && (
                                <div className="pt-2 border-t border-gray-100">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-600">{t('statCompletionRate')}</span>
                                        <span className="font-bold text-purple-600">{completionRate}%</span>
                                    </div>
                                    <Progress value={completionRate} className="h-1.5" />
                                </div>
                            )}
                            <div className="flex justify-between text-sm pt-1">
                                <span className="text-gray-600">{t('statSince')}</span>
                                <span className="font-medium">
                                    {student.since ? new Date(student.since).toLocaleDateString(locale, { month: 'short', year: 'numeric' }) : t('statSinceEmpty')}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Plans list */}
                <div className="md:col-span-2">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-purple-600" />
                                    {t('titlePlans')}
                                </CardTitle>
                                <Button
                                    size="sm"
                                    className="bg-purple-600 hover:bg-purple-700"
                                    onClick={() => router.push(`/dashboard/plans/create?studentId=${studentId}`)}
                                    disabled={profiles.length === 0}
                                >
                                    <Plus className="w-4 h-4 mr-1" />
                                    {t('btnNewPlan')}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {plans.length === 0 ? (
                                <div className="text-center py-8">
                                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-600 text-sm">{t('emptyPlansTitle')}</p>
                                    {profiles.length > 0 && (
                                        <Button
                                            className="mt-3 bg-purple-600 hover:bg-purple-700"
                                            size="sm"
                                            onClick={() => router.push(`/dashboard/plans/create?studentId=${studentId}`)}
                                        >
                                            <Plus className="mr-2 h-4 w-4" />
                                            {t('btnCreateFirstPlan')}
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {plans.map((plan) => {
                                        const StatusIcon = STATUS_LABELS[plan.status]?.icon || AlertCircle
                                        const hasProgress = plan.progress?.total > 0
                                        return (
                                            <div
                                                key={plan.id}
                                                className="p-3 border border-gray-200 rounded-lg hover:shadow-sm cursor-pointer transition-all space-y-2"
                                                onClick={() => router.push(`/dashboard/plans/${plan.id}`)}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 truncate">{plan.title}</p>
                                                        <div className="flex items-center gap-3 mt-0.5">
                                                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                {t('planDurationDays', { days: plan.duration })}
                                                            </span>
                                                            <span className="text-xs text-gray-500">
                                                                {new Date(plan.createdAt).toLocaleDateString(locale)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <Badge
                                                        className={`${STATUS_LABELS[plan.status]?.color} flex items-center gap-1 ml-3 flex-shrink-0`}
                                                        variant="outline"
                                                    >
                                                        <StatusIcon className="w-3 h-3" />
                                                        {STATUS_LABELS[plan.status]?.label}
                                                    </Badge>
                                                </div>
                                                {/* Progress bar (only when there are sessions) */}
                                                {hasProgress && (
                                                    <div onClick={e => e.stopPropagation()} className="space-y-1">
                                                        <Progress value={plan.progress.percent} className="h-1.5" />
                                                        <div className="flex justify-between items-center">
                                                            <p className="text-xs text-gray-400">
                                                                {t('planSessionsPercent', { completed: plan.progress.completed, total: plan.progress.total, percent: plan.progress.percent })}
                                                            </p>
                                                            {plan.trainingSessions?.some(s => s.athleteFeedback) && (
                                                                <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
                                                                    <MessageSquare className="w-3 h-3" />
                                                                    {t('planNewFeedback')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
