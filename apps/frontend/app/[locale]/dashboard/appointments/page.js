'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
    Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
    Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
    Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
    CalendarDays, Plus, Loader2, Clock, MapPin, CheckCircle2,
    XCircle, Check, X, Pencil, Trash2, User, ChevronLeft,
    ChevronRight, Settings, Ban, AlertCircle, Link2, Link2Off,
    BadgeCheck, Copy, TrendingUp, Users2, Video
} from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { format, isFuture, isPast, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ROLES } from '@/lib/constants'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    PENDING:   {
        label: 'Pendente',
        bg:    'bg-amber-100 border-amber-400 text-amber-800',
        dot:   'bg-amber-400',
        icon:  Clock,
        stripes: null,
    },
    CONFIRMED: {
        label: 'Confirmado',
        bg:    'bg-emerald-100 border-emerald-500 text-emerald-800',
        dot:   'bg-emerald-500',
        icon:  Check,
        stripes: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(16,185,129,0.13) 5px, rgba(16,185,129,0.13) 10px)',
    },
    CANCELED:  {
        label: 'Cancelado',
        bg:    'bg-red-100 border-red-400 text-red-800',
        dot:   'bg-red-400',
        icon:  X,
        stripes: null,
    },
    COMPLETED: {
        label: 'Realizado',
        bg:    'bg-emerald-200 border-emerald-600 text-emerald-900',
        dot:   'bg-emerald-600',
        icon:  BadgeCheck,
        stripes: null,
    },
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const HOUR_PX = 64 // pixels per hour
const MIN_PX  = HOUR_PX / 60 // pixels per minute

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0') }

function minutesFromMidnight(date) {
    const d = new Date(date)
    return d.getHours() * 60 + d.getMinutes()
}

function topPx(date, workStartHour) {
    return (minutesFromMidnight(date) - workStartHour * 60) * MIN_PX
}

function heightPx(durationMinutes) {
    return Math.max(durationMinutes * MIN_PX, 24)
}

function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' }
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    )
}

// ─── Appointment Detail Modal (double-click) ───────────────────────────────────

function AppointmentDetailModal({ apt, open, onClose, onEdit, onDelete, onStatusChange, onRefresh }) {
    const [notes, setNotes]       = useState(apt?.trainerNotes ?? '')
    const [savingNotes, setSavingNotes] = useState(false)
    const [linking, setLinking]   = useState(false)
    const [generatedUrl, setGeneratedUrl] = useState(null)

    // Sync notes when apt changes
    useEffect(() => { if (apt) setNotes(apt.trainerNotes ?? '') }, [apt])

    if (!apt) return null

    const name       = apt.student?.name ?? apt.athlete?.name ?? '—'
    const isFutureApt = new Date(apt.scheduledAt) > new Date()
    const cfg        = STATUS_CONFIG[apt.status] ?? STATUS_CONFIG.PENDING
    const StatusIcon = cfg.icon ?? Clock

    const saveNotes = async () => {
        setSavingNotes(true)
        try {
            const res = await fetch(`/api/backend/appointments/${apt.id}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ trainerNotes: notes }),
            })
            if (!res.ok) throw new Error((await res.json()).error)
            toast.success('Anotações salvas')
            onRefresh()
        } catch (e) { toast.error(e.message) }
        finally { setSavingNotes(false) }
    }

    const handleStatusAction = async (status) => {
        await onStatusChange(apt.id, status)
        onClose()
    }

    const handleDelete = () => { onDelete(apt.id); onClose() }

    const handleGenerateLink = async () => {
        setLinking(true)
        try {
            const res  = await fetch(`/api/backend/appointments/${apt.id}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ action: 'generate-link' }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setGeneratedUrl(data.confirmUrl)
            await navigator.clipboard.writeText(data.confirmUrl)
            toast.success('Link copiado!')
            onRefresh()
        } catch (e) { toast.error(e.message) }
        finally { setLinking(false) }
    }

    const handleRevokeLink = async () => {
        setLinking(true)
        try {
            const res = await fetch(`/api/backend/appointments/${apt.id}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ action: 'revoke-link' }),
            })
            if (!res.ok) throw new Error((await res.json()).error)
            setGeneratedUrl(null)
            toast.success('Link revogado')
            onRefresh()
        } catch (e) { toast.error(e.message) }
        finally { setLinking(false) }
    }

    const activeToken = apt.confirmToken ?? (generatedUrl ? generatedUrl.split('/').pop() : null)

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-2xl p-0 overflow-hidden">
                {/* ── Header ── */}
                <div className={`px-6 py-5 ${cfg.bg} border-b`} style={cfg.stripes ? { backgroundImage: cfg.stripes } : {}}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/60`}>
                                <StatusIcon className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold leading-tight">{apt.title}</h2>
                                <p className="text-sm opacity-70 mt-0.5">
                                    {format(new Date(apt.scheduledAt), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                                    {' · '}{apt.durationMinutes} min
                                </p>
                            </div>
                        </div>
                        <StatusBadge status={apt.status} />
                    </div>
                </div>

                {/* ── Body ── */}
                <div className="grid grid-cols-[1fr_280px] divide-x">
                    {/* Left — info + actions */}
                    <div className="p-5 space-y-5">
                        {/* Details */}
                        <div className="space-y-2.5 text-sm text-gray-700">
                            <div className="flex items-center gap-2.5">
                                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="font-medium">{name}</span>
                            </div>
                            {apt.location && !apt.googleMeetLink && (
                                <div className="flex items-center gap-2.5">
                                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <span>{apt.location}</span>
                                </div>
                            )}
                            {apt.googleMeetLink && (
                                <div className="flex items-center gap-2.5">
                                    <Video className="w-4 h-4 text-green-600 flex-shrink-0" />
                                    <a href={apt.googleMeetLink} target="_blank" rel="noopener noreferrer" className="text-green-700 font-medium hover:underline">
                                        Entrar no Google Meet
                                    </a>
                                </div>
                            )}
                            {apt.videoJoinUrl && (
                                <div className="flex items-center gap-2.5">
                                    <Video className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                    <a href={`/dashboard/appointments/${apt.id}/video`} className="text-blue-700 font-medium hover:underline">
                                        Entrar na Chamada Online
                                    </a>
                                </div>
                            )}
                            {apt.description && (
                                <div className="flex items-start gap-2.5">
                                    <AlertCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-gray-500 leading-relaxed">{apt.description}</p>
                                </div>
                            )}
                        </div>

                        {/* Status actions */}
                        <div className="space-y-2 pt-3 border-t">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ações</p>
                            <div className="flex flex-wrap gap-2">
                                {apt.status === 'PENDING' && (
                                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" onClick={() => handleStatusAction('COMPLETED')}>
                                        <Check className="w-3.5 h-3.5" /> Marcar como realizado
                                    </Button>
                                )}
                                {apt.status === 'CONFIRMED' && (
                                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" onClick={() => handleStatusAction('COMPLETED')}>
                                        <BadgeCheck className="w-3.5 h-3.5" /> Concluir sessão
                                    </Button>
                                )}
                                {['PENDING', 'CONFIRMED'].includes(apt.status) && (
                                    <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 gap-1.5" onClick={() => handleStatusAction('CANCELED')}>
                                        <X className="w-3.5 h-3.5" /> Cancelar
                                    </Button>
                                )}
                                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { onEdit(apt); onClose() }}>
                                    <Pencil className="w-3.5 h-3.5" /> Editar
                                </Button>
                                <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 gap-1.5" onClick={handleDelete}>
                                    <Trash2 className="w-3.5 h-3.5" /> Deletar
                                </Button>
                            </div>
                        </div>

                        {/* Confirmation link */}
                        {apt.status === 'PENDING' && (
                            <div className="space-y-2 pt-3 border-t">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Link de Confirmação</p>
                                {activeToken ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                            <Link2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                            <span className="text-xs text-emerald-700 font-medium flex-1 truncate">Link ativo</span>
                                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2 gap-1 text-emerald-700 hover:bg-emerald-100"
                                                onClick={async () => {
                                                    const url = generatedUrl ?? `${window.location.origin}/confirm/${apt.confirmToken}`
                                                    await navigator.clipboard.writeText(url)
                                                    toast.success('Link copiado!')
                                                }}>
                                                <Copy className="w-3 h-3" /> Copiar
                                            </Button>
                                        </div>
                                        <Button variant="outline" size="sm" className="w-full gap-1.5 text-red-500 border-red-200 hover:bg-red-50 text-xs" onClick={handleRevokeLink} disabled={linking}>
                                            {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2Off className="w-3.5 h-3.5" />}
                                            Revogar link
                                        </Button>
                                    </div>
                                ) : isFutureApt ? (
                                    <Button variant="outline" size="sm" className="w-full gap-2 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={handleGenerateLink} disabled={linking}>
                                        {linking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                                        Gerar e copiar link de confirmação
                                    </Button>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">Agendamento no passado — link indisponível</p>
                                )}
                            </div>
                        )}

                        {/* Placeholders futuros */}
                        <div className="pt-3 border-t space-y-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Clock className="w-3 h-3" /> Em breve
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {['🔔 Lembretes automáticos', '🎂 Aniversário do aluno'].map(label => (
                                    <div key={label} className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-dashed border-gray-200 cursor-not-allowed opacity-60">
                                        {label}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right — trainer notes */}
                    <div className="p-5 flex flex-col bg-amber-50/30">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Pencil className="w-3 h-3" /> Anotações do Treinador
                            </p>
                            {notes !== (apt.trainerNotes ?? '') && (
                                <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1 bg-white" onClick={saveNotes} disabled={savingNotes}>
                                    {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 text-emerald-600" />}
                                    Salvar
                                </Button>
                            )}
                        </div>
                        <Textarea
                            className="flex-1 resize-none text-sm bg-white/80 border-amber-200 focus-visible:ring-amber-400 min-h-[200px]"
                            placeholder="Adicione observações sobre este agendamento, progresso do aluno, materiais necessários..."
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                        <p className="text-[10px] text-gray-400 mt-2">Visível apenas para você</p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ─── Appointment Block ─────────────────────────────────────────────────────────


function AppointmentBlock({ apt, workStartHour, onEdit, onDelete, onStatusChange, onRefresh }) {
    const [open, setOpen]         = useState(false)
    const [detailOpen, setDetailOpen] = useState(false)
    const [linking, setLinking]   = useState(false)
    const [confirmUrl, setConfirmUrl] = useState(apt.confirmToken ? '(link ativo)' : null)
    const cfg        = STATUS_CONFIG[apt.status] ?? STATUS_CONFIG.PENDING
    const StatusIcon = cfg.icon ?? Clock
    const top        = topPx(apt.scheduledAt, workStartHour)
    const height     = heightPx(apt.durationMinutes)
    const name       = apt.student?.name ?? apt.athlete?.name ?? '—'
    const isCanceled = apt.status === 'CANCELED'
    const isFutureApt = new Date(apt.scheduledAt) > new Date()
    const showAlertDot = apt.status === 'PENDING' && !apt.confirmToken && isFutureApt

    const handleGenerateLink = async () => {
        setLinking(true)
        try {
            const res  = await fetch(`/api/backend/appointments/${apt.id}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ action: 'generate-link' }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setConfirmUrl(data.confirmUrl)
            await navigator.clipboard.writeText(data.confirmUrl)
            toast.success('Link copiado para a área de transferência!')
            onRefresh()
        } catch (e) { toast.error(e.message) }
        finally { setLinking(false) }
    }

    const handleRevokeLink = async () => {
        setLinking(true)
        try {
            const res = await fetch(`/api/backend/appointments/${apt.id}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ action: 'revoke-link' }),
            })
            if (!res.ok) throw new Error((await res.json()).error)
            setConfirmUrl(null)
            toast.success('Link revogado')
            onRefresh()
        } catch (e) { toast.error(e.message) }
        finally { setLinking(false) }
    }

    return (
        <>
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div
                    className={`absolute left-0.5 right-0.5 rounded border-l-2 px-1.5 py-1 cursor-pointer select-none overflow-hidden
                        transition-all hover:z-30 hover:shadow-lg hover:scale-[1.01]
                        ${cfg.bg} border-l-current z-10 ${isCanceled ? 'opacity-50 line-through' : ''}`}
                    style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        minHeight: '24px',
                        ...(cfg.stripes ? { backgroundImage: cfg.stripes } : {}),
                    }}
                    onDoubleClick={e => { e.stopPropagation(); setOpen(false); setDetailOpen(true) }}
                >
                    {/* Alert dot — PENDING sem link ativo */}
                    {showAlertDot && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500 animate-pulse" title="Aguardando confirmação" />
                    )}

                    <div className="flex items-start gap-1">
                        <StatusIcon className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 opacity-70" />
                        <div className="min-w-0">
                            <div className="text-xs font-semibold leading-tight truncate">{apt.title}</div>
                            {height >= 40 && <div className="text-[10px] opacity-70 truncate">{name}</div>}
                            {height >= 56 && (
                                <div className="text-[10px] opacity-60">
                                    {format(new Date(apt.scheduledAt), 'HH:mm')} · {apt.durationMinutes}min
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start" side="right">
                <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <p className="font-semibold text-sm leading-tight">{apt.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {format(new Date(apt.scheduledAt), "EEE, d 'de' MMM · HH:mm", { locale: ptBR })}
                                {' — '}{apt.durationMinutes} min
                            </p>
                        </div>
                        <StatusBadge status={apt.status} />
                    </div>

                    <div className="space-y-1.5 text-xs text-gray-600">
                        <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-gray-400" />
                            <span>{name}</span>
                        </div>
                        {apt.googleMeetLink && (
                            <div className="flex items-center gap-1.5">
                                <Video className="w-3 h-3 text-green-600 flex-shrink-0" />
                                <a href={apt.googleMeetLink} target="_blank" rel="noopener noreferrer" className="text-green-700 font-medium hover:underline truncate">
                                    Entrar no Google Meet
                                </a>
                            </div>
                        )}
                        {apt.videoJoinUrl && (
                            <div className="flex items-center gap-1.5">
                                <Video className="w-3 h-3 text-blue-600 flex-shrink-0" />
                                <a href={`/dashboard/appointments/${apt.id}/video`} className="text-blue-700 font-medium hover:underline truncate">
                                    Entrar na Chamada Online
                                </a>
                            </div>
                        )}
                        {apt.location && !apt.googleMeetLink && (
                            <div className="flex items-center gap-1.5">
                                <MapPin className="w-3 h-3 text-gray-400" />
                                <span>{apt.location}</span>
                            </div>
                        )}
                        {apt.description && (
                            <p className="text-gray-500 line-clamp-2 pt-0.5">{apt.description}</p>
                        )}
                    </div>

                    {/* Ações de status */}
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t">
                        {apt.status === 'PENDING' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => { onStatusChange(apt.id, 'COMPLETED'); setOpen(false) }}>
                                <Check className="w-3 h-3 mr-1" /> Realizado
                            </Button>
                        )}
                        {apt.status === 'CONFIRMED' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => { onStatusChange(apt.id, 'COMPLETED'); setOpen(false) }}>
                                <BadgeCheck className="w-3 h-3 mr-1" /> Concluir
                            </Button>
                        )}
                        {['PENDING', 'CONFIRMED'].includes(apt.status) && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => { onStatusChange(apt.id, 'CANCELED'); setOpen(false) }}>
                                <X className="w-3 h-3 mr-1" /> Cancelar
                            </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { onEdit(apt); setOpen(false) }}>
                            <Pencil className="w-3 h-3 mr-1" /> Editar
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50" onClick={() => { onDelete(apt.id); setOpen(false) }}>
                            <Trash2 className="w-3 h-3 mr-1" /> Deletar
                        </Button>
                    </div>

                    {/* Link de confirmação */}
                    {apt.status === 'PENDING' && (
                        <div className="pt-1 border-t space-y-1.5">
                            {apt.confirmToken ? (
                                <>
                                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1.5">
                                        <Link2 className="w-3 h-3" />
                                        <span className="font-medium">Link de confirmação ativo</span>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <Button
                                            size="sm" variant="outline" className="h-7 text-xs flex-1 gap-1"
                                            onClick={async () => {
                                                const url = `${window.location.origin}/confirm/${apt.confirmToken}`
                                                await navigator.clipboard.writeText(url)
                                                toast.success('Link copiado!')
                                            }}
                                        >
                                            <Copy className="w-3 h-3" /> Copiar link
                                        </Button>
                                        <Button
                                            size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50"
                                            onClick={handleRevokeLink} disabled={linking}
                                        >
                                            {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2Off className="w-3 h-3" />}
                                        </Button>
                                    </div>
                                </>
                            ) : isFutureApt ? (
                                <Button
                                    size="sm" variant="outline"
                                    className="h-7 text-xs w-full gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                                    onClick={handleGenerateLink} disabled={linking}
                                >
                                    {linking
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <Link2 className="w-3 h-3" />}
                                    Gerar link de confirmação
                                </Button>
                            ) : null}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
        <AppointmentDetailModal
            apt={apt}
            open={detailOpen}
            onClose={() => setDetailOpen(false)}
            onEdit={onEdit}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
            onRefresh={onRefresh}
        />
        </>
    )
}

// ─── Blocked Slot Block ────────────────────────────────────────────────────────

function BlockedSlotBlock({ slot, workStartHour, onDelete }) {
    const startDate  = new Date(slot.startTime)
    const endDate    = new Date(slot.endTime)
    const durMinutes = (endDate - startDate) / 60000
    const top    = topPx(startDate, workStartHour)
    const height = heightPx(durMinutes)

    return (
        <div
            className="absolute left-0.5 right-0.5 rounded bg-gray-200 border border-gray-300 z-5 cursor-pointer overflow-hidden opacity-80 hover:opacity-100 transition-opacity group"
            style={{ top: `${top}px`, height: `${height}px`, backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.04) 4px, rgba(0,0,0,0.04) 8px)' }}
            title={slot.label ? `Bloqueio: ${slot.label}` : 'Horário bloqueado'}
            onClick={() => onDelete(slot.id)}
        >
            <div className="text-[10px] font-medium text-gray-500 px-1 pt-0.5 truncate">{slot.label ?? 'Bloqueado'}</div>
            <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-gray-300/50 rounded">
                <Trash2 className="w-3 h-3 text-gray-600" />
            </div>
        </div>
    )
}

// ─── Settings Sheet ────────────────────────────────────────────────────────────

function ScheduleSettingsSheet({ config, blockedSlots, onSaved }) {
    const [open, setOpen]       = useState(false)
    const [saving, setSaving]   = useState(false)
    const [form, setForm]       = useState({ workStartHour: 7, workEndHour: 22, workDays: [1,2,3,4,5] })
    const [blockForm, setBlockForm] = useState({ label: '', startTime: '', endTime: '', isRecurring: false })
    const [addingBlock, setAddingBlock] = useState(false)

    useEffect(() => {
        if (config) {
            setForm({ workStartHour: config.workStartHour, workEndHour: config.workEndHour, workDays: config.workDays ?? [1,2,3,4,5] })
        }
    }, [config])

    const toggleDay = (d) => setForm(f => ({
        ...f,
        workDays: f.workDays.includes(d) ? f.workDays.filter(x => x !== d) : [...f.workDays, d].sort()
    }))

    const saveConfig = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/backend/trainer/schedule-config', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            if (!res.ok) throw new Error((await res.json()).error)
            toast.success('Configurações salvas!')
            onSaved()
        } catch (e) { toast.error(e.message) }
        finally { setSaving(false) }
    }

    const addBlockedSlot = async () => {
        if (!blockForm.startTime || !blockForm.endTime) { toast.error('Hora de início e fim são obrigatórias'); return }
        setAddingBlock(true)
        try {
            const res = await fetch('/api/backend/trainer/blocked-slots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(blockForm),
            })
            if (!res.ok) throw new Error((await res.json()).error)
            toast.success('Bloqueio adicionado!')
            setBlockForm({ label: '', startTime: '', endTime: '', isRecurring: false })
            onSaved()
        } catch (e) { toast.error(e.message) }
        finally { setAddingBlock(false) }
    }

    const deleteBlock = async (id) => {
        try {
            const res = await fetch(`/api/backend/trainer/blocked-slots/${id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error((await res.json()).error)
            toast.success('Bloqueio removido')
            onSaved()
        } catch (e) { toast.error(e.message) }
    }

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Settings className="w-4 h-4" /> Configurar
                </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
                <SheetHeader className="mb-6">
                    <SheetTitle>Configurações do Expediente</SheetTitle>
                    <SheetDescription>Defina seus horários de trabalho e bloqueios</SheetDescription>
                </SheetHeader>

                {/* Work Hours */}
                <div className="space-y-4 mb-6">
                    <h3 className="text-sm font-semibold text-gray-800">Horário do Expediente</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-600">Início</label>
                            <Input
                                type="number" min={0} max={23}
                                value={form.workStartHour}
                                onChange={e => setForm(f => ({ ...f, workStartHour: Number(e.target.value) }))}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-600">Fim</label>
                            <Input
                                type="number" min={1} max={24}
                                value={form.workEndHour}
                                onChange={e => setForm(f => ({ ...f, workEndHour: Number(e.target.value) }))}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-600">Dias de trabalho</label>
                        <div className="flex gap-1.5 flex-wrap">
                            {DAY_LABELS.map((d, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => toggleDay(i)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                                        ${form.workDays.includes(i) ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Button onClick={saveConfig} disabled={saving} className="w-full bg-green-600 hover:bg-green-700">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Salvar Expediente
                    </Button>
                </div>

                {/* Blocked Slots */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                        <Ban className="w-4 h-4 text-gray-400" /> Bloqueios de Horário
                    </h3>

                    {/* Existing */}
                    {blockedSlots.length > 0 ? (
                        <div className="space-y-2 max-h-52 overflow-y-auto">
                            {blockedSlots.map(slot => (
                                <div key={slot.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-gray-700 truncate">{slot.label ?? 'Sem rótulo'}</p>
                                        <p className="text-[10px] text-gray-500">
                                            {format(new Date(slot.startTime), "dd/MM/yy HH:mm")} → {format(new Date(slot.endTime), "HH:mm")}
                                            {slot.isRecurring && ' · recorrente'}
                                        </p>
                                    </div>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0" onClick={() => deleteBlock(slot.id)}>
                                        <X className="w-3 h-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic">Nenhum bloqueio cadastrado</p>
                    )}

                    {/* Add new */}
                    <div className="space-y-2 pt-2 border-t">
                        <p className="text-xs font-medium text-gray-600">Adicionar bloqueio</p>
                        <Input
                            placeholder="Rótulo (ex: Almoço)"
                            value={blockForm.label}
                            onChange={e => setBlockForm(f => ({ ...f, label: e.target.value }))}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-500">Início</label>
                                <Input type="datetime-local" value={blockForm.startTime} onChange={e => setBlockForm(f => ({ ...f, startTime: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-500">Fim</label>
                                <Input type="datetime-local" value={blockForm.endTime} onChange={e => setBlockForm(f => ({ ...f, endTime: e.target.value }))} />
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={blockForm.isRecurring}
                                onChange={e => setBlockForm(f => ({ ...f, isRecurring: e.target.checked }))}
                                className="rounded"
                            />
                            Repetir semanalmente
                        </label>
                        <Button onClick={addBlockedSlot} disabled={addingBlock} size="sm" variant="outline" className="w-full gap-2 border-dashed">
                            {addingBlock ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                            Adicionar Bloqueio
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}

// ─── Create/Edit Modal ─────────────────────────────────────────────────────────

function AppointmentModal({ open, onClose, editTarget, students, prefill, onSaved }) {
    const [form, setForm] = useState({ title: '', scheduledAt: '', durationMinutes: 60, location: '', description: '', studentId: '', trainerNotes: '' })
    const [createMeet, setCreateMeet] = useState(false)
    const [createVideo, setCreateVideo] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (editTarget) {
            setForm({
                title: editTarget.title,
                scheduledAt: new Date(editTarget.scheduledAt).toISOString().slice(0, 16),
                durationMinutes: editTarget.durationMinutes,
                location: editTarget.location ?? '',
                description: editTarget.description ?? '',
                studentId: editTarget.studentId ?? '',
                trainerNotes: editTarget.trainerNotes ?? '',
            })
        } else if (prefill) {
            setForm(f => ({ ...f, scheduledAt: prefill }))
        } else {
            setForm({ title: '', scheduledAt: '', durationMinutes: 60, location: '', description: '', studentId: '', trainerNotes: '' })
        }
    }, [editTarget, prefill, open])

    const handleSubmit = async () => {
        if (!form.title.trim() || !form.scheduledAt) { toast.error('Título e data/hora são obrigatórios'); return }
        if (!form.studentId && !editTarget) { toast.error('Selecione um aluno'); return }
        setSubmitting(true)
        try {
            const url    = editTarget ? `/api/backend/appointments/${editTarget.id}` : '/api/backend/appointments'
            const method = editTarget ? 'PATCH' : 'POST'
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    durationMinutes: Number(form.durationMinutes),
                    scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : form.scheduledAt,
                    ...(!editTarget && { createMeet }),
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            let videoJoinUrl = json.appointment?.videoJoinUrl ?? null
            let videoNotAvailable = false
            if (!editTarget && createVideo && json.appointment?.id) {
                try {
                    const videoRes = await fetch(`/api/backend/appointments/${json.appointment.id}/video`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                    })
                    const videoJson = await videoRes.json()
                    if (videoRes.ok && videoJson.video?.joinUrl) {
                        videoJoinUrl = videoJson.video.joinUrl
                    } else if (videoJson.videoNotAvailable) {
                        videoNotAvailable = true
                    } else if (!videoRes.ok) {
                        throw new Error(videoJson.error || 'Falha ao gerar chamada online')
                    }
                } catch (e) { videoNotAvailable = true }
            }
            if (createMeet && json.meetNotAvailable) {
                toast.success('Agendamento criado!')
                toast.warning('Link do Google Meet não gerado — faça logout e login novamente com o Google para ativar a integração.')
            } else if (createMeet && json.appointment?.googleMeetLink) {
                toast.success('Agendamento criado com link do Google Meet!')
            } else {
                toast.success(editTarget ? 'Agendamento atualizado!' : 'Agendamento criado!')
            }
            if (!editTarget && createVideo) {
                if (videoNotAvailable) {
                    toast.warning('Chamada Online indisponível no momento — tente gerar depois pelo detalhe.')
                } else if (videoJoinUrl) {
                    toast.success('Chamada Online gerada! Link disponível no detalhe.')
                }
            }
            onClose()
            onSaved()
        } catch (err) { toast.error(err.message) }
        finally { setSubmitting(false) }
    }

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{editTarget ? 'Editar Agendamento' : 'Novo Agendamento'}</DialogTitle>
                    <DialogDescription>Preencha os detalhes da sessão</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-1">
                        <label className="text-sm font-medium">Título *</label>
                        <Input placeholder="Ex: Treino funcional" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={150} />
                    </div>
                    {!editTarget && (
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Aluno *</label>
                            <Select value={form.studentId} onValueChange={v => setForm(f => ({ ...f, studentId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Selecionar aluno..." /></SelectTrigger>
                                <SelectContent>
                                    {students.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}{s.email ? ` (${s.email})` : ''}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Data e Hora *</label>
                            <Input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Duração (min)</label>
                            <Input type="number" min={5} max={480} value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium">Local / Link</label>
                        <Input placeholder="Ex: Quadra 1, sala online..." value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium">Descrição</label>
                        <Textarea placeholder="Detalhes do agendamento..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
                    </div>
                    {/* Google Meet desativado (fatia 37): sem scope calendar.events o link nunca gera.
                        Para reativar, descomente o bloco abaixo e o scope no lib/auth.ts. */}
                    {/* {!editTarget && (
                        <div className="flex items-center justify-between rounded-lg border p-3 bg-gray-50">
                            <div>
                                <p className="text-sm font-medium">Google Meet</p>
                                <p className="text-xs text-gray-500">Gerar link de videoconferência automaticamente</p>
                            </div>
                            <Switch checked={createMeet} onCheckedChange={setCreateMeet} />
                        </div>
                    )} */}
                    {!editTarget && (
                        <div className="flex items-center justify-between rounded-lg border p-3 bg-gray-50">
                            <div>
                                <p className="text-sm font-medium">Chamada Online</p>
                                <p className="text-xs text-gray-500">Gerar sala de vídeo 1:1 automaticamente</p>
                            </div>
                            <Switch checked={createVideo} onCheckedChange={setCreateVideo} />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button className="bg-green-600 hover:bg-green-700" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        {editTarget ? 'Salvar' : 'Criar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Trainer Weekly Grid ───────────────────────────────────────────────────────

function TrainerWeeklyGrid({ appointments, loading, onRefresh }) {
    const [weekOffset, setWeekOffset] = useState(0)
    const [config, setConfig]         = useState({ workStartHour: 7, workEndHour: 22, workDays: [1,2,3,4,5] })
    const [blockedSlots, setBlockedSlots] = useState([])
    const [students, setStudents]         = useState([])
    const [nowMinutes, setNowMinutes]     = useState(0)
    const [modalOpen, setModalOpen]       = useState(false)
    const [editTarget, setEditTarget]     = useState(null)
    const [prefill, setPrefill]           = useState('')
    const gridRef = useRef(null)

    // Current week dates
    const today       = new Date()
    const weekStart   = startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 0 })
    const weekDays    = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const workHours   = Array.from({ length: config.workEndHour - config.workStartHour }, (_, i) => config.workStartHour + i)
    const gridHeight  = (config.workEndHour - config.workStartHour) * HOUR_PX

    // Fetch config + students
    const fetchConfig = useCallback(async () => {
        try {
            const [cfgRes, stuRes] = await Promise.all([
                fetch('/api/backend/trainer/schedule-config'),
                fetch('/api/backend/students'),
            ])
            if (cfgRes.ok) {
                const { config: c } = await cfgRes.json()
                setConfig(c)
                setBlockedSlots(c.blockedSlots ?? [])
            }
            if (stuRes.ok) {
                const d = await stuRes.json()
                if (d?.students) setStudents(d.students)
            }
        } catch {}
    }, [])

    useEffect(() => { fetchConfig() }, [fetchConfig])

    // Now-line: update every minute
    useEffect(() => {
        const update = () => setNowMinutes(new Date().getHours() * 60 + new Date().getMinutes())
        update()
        const id = setInterval(update, 60000)
        return () => clearInterval(id)
    }, [])

    // Auto-scroll to current time on mount
    useEffect(() => {
        if (!gridRef.current) return
        const top = (nowMinutes - config.workStartHour * 60) * MIN_PX - 80
        gridRef.current.scrollTop = Math.max(0, top)
    }, [config.workStartHour, nowMinutes])

    const handleDelete = async (id) => {
        if (!confirm('Deletar este agendamento?')) return
        try {
            const res = await fetch(`/api/backend/appointments/${id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error((await res.json()).error)
            toast.success('Agendamento deletado')
            onRefresh()
        } catch (err) { toast.error(err.message) }
    }

    const handleStatusChange = async (id, status) => {
        try {
            const res = await fetch(`/api/backend/appointments/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            })
            if (!res.ok) throw new Error((await res.json()).error)
            toast.success('Status atualizado')
            onRefresh()
        } catch (err) { toast.error(err.message) }
    }

    const handleDeleteBlock = async (id) => {
        if (!confirm('Remover este bloqueio?')) return
        try {
            const res = await fetch(`/api/backend/trainer/blocked-slots/${id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error((await res.json()).error)
            toast.success('Bloqueio removido')
            fetchConfig()
        } catch (err) { toast.error(err.message) }
    }

    // Click on empty slot to pre-fill create modal
    const handleSlotClick = (dayDate, e) => {
        if (e.target !== e.currentTarget) return // only background clicks
        const rect = e.currentTarget.getBoundingClientRect()
        const relY = e.clientY - rect.top + e.currentTarget.parentElement.parentElement.scrollTop
        const minutesFromStart = relY / MIN_PX
        const totalMinutes = config.workStartHour * 60 + minutesFromStart
        const hours = Math.floor(totalMinutes / 60)
        const mins  = Math.round((totalMinutes % 60) / 15) * 15 // snap to 15min
        const dateStr = format(dayDate, 'yyyy-MM-dd')
        setPrefill(`${dateStr}T${pad(hours)}:${pad(Math.min(mins, 59))}`)
        setEditTarget(null)
        setModalOpen(true)
    }

    const openEdit = (apt) => {
        setEditTarget(apt)
        setPrefill('')
        setModalOpen(true)
    }

    // Filter appointments for a specific day
    const aptsForDay = (day) => appointments.filter(a => isSameDay(new Date(a.scheduledAt), day))

    // Filter blocked slots for a specific day (or recurring match)
    const blocksForDay = (day) => {
        const dayOfWeek = day.getDay()
        return blockedSlots.filter(slot => {
            const slotDate = new Date(slot.startTime)
            if (slot.isRecurring) return slotDate.getDay() === dayOfWeek
            return isSameDay(slotDate, day)
        })
    }

    // Now-line position
    const nowTop = (nowMinutes - config.workStartHour * 60) * MIN_PX
    const showNowLine = weekOffset === 0 && nowMinutes >= config.workStartHour * 60 && nowMinutes <= config.workEndHour * 60

    return (
        <div className="flex flex-col h-full">
            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Agendamentos</h1>
                    <p className="text-sm text-gray-500">
                        {format(weekStart, "d 'de' MMM", { locale: ptBR })} – {format(addDays(weekStart, 6), "d 'de' MMM yyyy", { locale: ptBR })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center border rounded-lg overflow-hidden">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none border-r" onClick={() => setWeekOffset(w => w - 1)}>
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 rounded-none px-3 text-sm" onClick={() => setWeekOffset(0)}>
                            Hoje
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none border-l" onClick={() => setWeekOffset(w => w + 1)}>
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                    <ScheduleSettingsSheet
                        config={config}
                        blockedSlots={blockedSlots}
                        onSaved={() => { fetchConfig(); onRefresh() }}
                    />
                    <Button onClick={() => { setEditTarget(null); setPrefill(''); setModalOpen(true) }} className="bg-green-600 hover:bg-green-700 gap-2">
                        <Plus className="w-4 h-4" /> Novo
                    </Button>
                </div>
            </div>

            {/* ── Metrics ── */}
            {(() => {
                const weekApts = appointments.filter(a => weekDays.some(d => isSameDay(new Date(a.scheduledAt), d)))
                const confirmedCount = weekApts.filter(a => a.status === 'CONFIRMED').length
                const completedCount = weekApts.filter(a => a.status === 'COMPLETED').length
                const confirmedPct   = weekApts.length > 0 ? Math.round((confirmedCount + completedCount) / weekApts.length * 100) : 0
                const todayApts      = appointments.filter(a => isToday(new Date(a.scheduledAt)) && a.status !== 'CANCELED')
                const noLink         = weekApts.filter(a => a.status === 'PENDING' && !a.confirmToken && new Date(a.scheduledAt) > new Date()).length

                const metrics = [
                    { label: 'Sessões na semana', value: weekApts.length,        icon: CalendarDays,  color: 'text-green-600',  bg: 'bg-green-50' },
                    { label: 'Confirmados',        value: `${confirmedPct}%`,     icon: TrendingUp,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Hoje',               value: todayApts.length,       icon: Clock,         color: 'text-blue-600',   bg: 'bg-blue-50' },
                    { label: 'Sem link pendente',  value: noLink,                 icon: AlertCircle,   color: noLink > 0 ? 'text-amber-600' : 'text-gray-400', bg: noLink > 0 ? 'bg-amber-50' : 'bg-gray-50' },
                ]
                return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {metrics.map(m => {
                            const Icon = m.icon
                            return (
                                <div key={m.label} className={`rounded-xl border border-gray-100 ${m.bg} px-4 py-3 flex items-center gap-3`}>
                                    <div className={`w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0`}>
                                        <Icon className={`w-4 h-4 ${m.color}`} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xl font-bold text-gray-900 leading-none">{m.value}</p>
                                        <p className="text-xs text-gray-500 mt-0.5 truncate">{m.label}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )
            })()}

            {/* ── Grid ── */}
            <div className="flex-1 rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                    </div>
                ) : (
                    <div className="flex flex-col h-full">
                        {/* Day headers */}
                        <div className="flex border-b border-gray-200 bg-gray-50">
                            <div className="w-14 flex-shrink-0 border-r border-gray-200" /> {/* gutter */}
                            {weekDays.map((day, i) => {
                                const isWorkDay = config.workDays.includes(day.getDay())
                                return (
                                    <div
                                        key={i}
                                        className={`flex-1 text-center py-2.5 border-r border-gray-200 last:border-r-0
                                            ${isToday(day) ? 'bg-green-50' : ''}
                                            ${!isWorkDay ? 'opacity-50' : ''}`}
                                    >
                                        <div className={`text-xs font-medium uppercase tracking-wider ${isToday(day) ? 'text-green-600' : 'text-gray-500'}`}>
                                            {format(day, 'EEE', { locale: ptBR })}
                                        </div>
                                        <div className={`text-lg font-semibold mt-0.5 w-8 h-8 rounded-full flex items-center justify-center mx-auto
                                            ${isToday(day) ? 'bg-green-600 text-white' : 'text-gray-800'}`}>
                                            {format(day, 'd')}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Time grid */}
                        <div className="flex flex-1 overflow-y-auto" ref={gridRef}>
                            {/* Hour labels */}
                            <div className="w-14 flex-shrink-0 relative border-r border-gray-200">
                                {workHours.map(h => (
                                    <div key={h} className="absolute right-2" style={{ top: `${(h - config.workStartHour) * HOUR_PX - 8}px` }}>
                                        <span className="text-[10px] text-gray-400 font-mono">{pad(h)}:00</span>
                                    </div>
                                ))}
                                <div style={{ height: `${gridHeight}px` }} />
                            </div>

                            {/* Day columns */}
                            {weekDays.map((day, di) => {
                                const isWorkDay  = config.workDays.includes(day.getDay())
                                const dayApts    = aptsForDay(day)
                                const dayBlocks  = blocksForDay(day)

                                return (
                                    <div key={di} className={`flex-1 border-r border-gray-200 last:border-r-0 relative ${isToday(day) ? 'bg-green-50/30' : ''}`}
                                        style={{ height: `${gridHeight}px` }}
                                        onClick={e => isWorkDay && handleSlotClick(day, e)}
                                    >
                                        {/* Hour separator lines */}
                                        {workHours.map(h => (
                                            <div key={h} className="absolute left-0 right-0 border-t border-gray-100 pointer-events-none"
                                                style={{ top: `${(h - config.workStartHour) * HOUR_PX}px` }}
                                            />
                                        ))}

                                        {/* Half-hour dashes */}
                                        {workHours.map(h => (
                                            <div key={`${h}h`} className="absolute left-2 right-0 border-t border-dashed border-gray-100 pointer-events-none"
                                                style={{ top: `${(h - config.workStartHour) * HOUR_PX + HOUR_PX/2}px` }}
                                            />
                                        ))}

                                        {/* Non-working day overlay */}
                                        {!isWorkDay && (
                                            <div className="absolute inset-0 bg-gray-100/60 pointer-events-none"
                                                style={{ backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 8px,rgba(0,0,0,0.02) 8px,rgba(0,0,0,0.02) 16px)' }}
                                            />
                                        )}

                                        {/* Now line */}
                                        {showNowLine && isToday(day) && (
                                            <div
                                                className="absolute left-0 right-0 z-20 pointer-events-none"
                                                style={{ top: `${nowTop}px` }}
                                            >
                                                <div className="relative flex items-center">
                                                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shadow-sm" />
                                                    <div className="flex-1 h-0.5 bg-red-500 shadow-sm" />
                                                </div>
                                            </div>
                                        )}

                                        {/* Blocked slots */}
                                        {dayBlocks.map(slot => (
                                            <BlockedSlotBlock
                                                key={slot.id}
                                                slot={slot.isRecurring ? { ...slot, startTime: new Date(new Date(slot.startTime).setFullYear(day.getFullYear(), day.getMonth(), day.getDate())).toISOString(), endTime: new Date(new Date(slot.endTime).setFullYear(day.getFullYear(), day.getMonth(), day.getDate())).toISOString() } : slot}
                                                workStartHour={config.workStartHour}
                                                onDelete={handleDeleteBlock}
                                            />
                                        ))}

                                        {/* Appointments */}
                                        {dayApts.map(apt => (
                                            <AppointmentBlock
                                                key={apt.id}
                                                apt={apt}
                                                workStartHour={config.workStartHour}
                                                onEdit={openEdit}
                                                onDelete={handleDelete}
                                                onStatusChange={handleStatusChange}
                                                onRefresh={onRefresh}
                                            />
                                        ))}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            <AppointmentModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                editTarget={editTarget}
                students={students}
                prefill={prefill}
                onSaved={onRefresh}
            />
        </div>
    )
}

// ─── Student Card View ─────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
    { icon: CalendarDays, color: 'text-green-600 bg-green-50', title: 'Agendado pelo treinador', desc: 'Seu treinador marca as sessões e você recebe uma notificação.' },
    { icon: CheckCircle2, color: 'text-blue-600 bg-blue-50',  title: 'Confirme sua presença',  desc: 'Abra o agendamento e clique em Confirmar para garantir sua vaga.' },
    { icon: Clock,        color: 'text-amber-600 bg-amber-50', title: 'No dia da sessão',       desc: 'Apareça no horário e local combinados — veja os detalhes aqui.' },
]

function StudentView({ appointments, loading, onRefresh }) {
    const [actioning, setActioning] = useState(null)

    const handleAction = async (id, status) => {
        setActioning(id + status)
        try {
            const res = await fetch(`/api/backend/appointments/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            })
            if (!res.ok) throw new Error((await res.json()).error)
            toast.success(status === 'CONFIRMED' ? 'Agendamento confirmado!' : 'Agendamento cancelado')
            onRefresh()
        } catch (err) { toast.error(err.message) }
        finally { setActioning(null) }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
    )

    const upcoming = appointments.filter(a => isFuture(new Date(a.scheduledAt)) && !['CANCELED', 'COMPLETED'].includes(a.status))
    const past     = appointments.filter(a => isPast(new Date(a.scheduledAt)) || ['CANCELED', 'COMPLETED'].includes(a.status))

    const AppointmentCard = ({ apt, faded = false }) => (
        <div className={`border border-gray-100 rounded-xl hover:shadow-md transition-all bg-white p-5 ${faded ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={apt.status} />
                    </div>
                    <h3 className="font-bold text-gray-900 text-base leading-tight truncate">{apt.title}</h3>
                    <div className="mt-3 space-y-1.5 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <span className="font-medium">{format(new Date(apt.scheduledAt), "EEE, d 'de' MMM 'às' HH:mm", { locale: ptBR })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span>{apt.durationMinutes} min</span>
                        </div>
                        {apt.googleMeetLink && (
                            <div className="flex items-center gap-2">
                                <Video className="w-4 h-4 text-green-600 flex-shrink-0" />
                                <a href={apt.googleMeetLink} target="_blank" rel="noopener noreferrer" className="text-green-700 font-medium hover:underline truncate">
                                    Entrar no Google Meet
                                </a>
                            </div>
                        )}
                        {apt.videoJoinUrl && (
                            <div className="flex items-center gap-2">
                                <Video className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                <a href={`/dashboard/appointments/${apt.id}/video`} className="text-blue-700 font-medium hover:underline truncate">
                                    Entrar na Chamada Online
                                </a>
                            </div>
                        )}
                        {apt.location && !apt.googleMeetLink && (
                            <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="truncate">{apt.location}</span>
                            </div>
                        )}
                        {apt.trainer && (
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="truncate">{apt.trainer.name}</span>
                            </div>
                        )}
                    </div>
                    {apt.description && <p className="mt-3 text-sm text-gray-500 line-clamp-2">{apt.description}</p>}
                </div>
                <div className="flex-shrink-0 text-center bg-green-50 rounded-xl p-3 min-w-[56px]">
                    <div className="text-2xl font-black text-green-700">{format(new Date(apt.scheduledAt), 'dd')}</div>
                    <div className="text-[10px] font-semibold text-green-600 uppercase">{format(new Date(apt.scheduledAt), 'MMM', { locale: ptBR })}</div>
                </div>
            </div>

            {apt.status === 'PENDING' && isFuture(new Date(apt.scheduledAt)) && (
                <div className="mt-4 flex gap-2">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 flex-1" onClick={() => handleAction(apt.id, 'CONFIRMED')} disabled={!!actioning}>
                        {actioning === apt.id + 'CONFIRMED' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1" /> Confirmar</>}
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 flex-1" onClick={() => handleAction(apt.id, 'CANCELED')} disabled={!!actioning}>
                        {actioning === apt.id + 'CANCELED' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-1" /> Recusar</>}
                    </Button>
                </div>
            )}
            {apt.status === 'CONFIRMED' && isFuture(new Date(apt.scheduledAt)) && (
                <div className="mt-4">
                    <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 w-full" onClick={() => handleAction(apt.id, 'CANCELED')} disabled={!!actioning}>
                        <XCircle className="w-4 h-4 mr-1" /> Cancelar presença
                    </Button>
                </div>
            )}
        </div>
    )

    // ── Empty state ──
    if (appointments.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center px-4">
                {/* Illustration */}
                <div className="relative mb-8">
                    <div className="w-24 h-24 rounded-full bg-green-50 flex items-center justify-center mx-auto">
                        <CalendarDays className="w-12 h-12 text-green-400" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-blue-500" />
                    </div>
                </div>

                <h2 className="text-xl font-bold text-gray-800 mb-2">Nenhum agendamento ainda</h2>
                <p className="text-gray-500 text-sm max-w-sm mb-10">
                    Quando seu treinador agendar uma sessão, ela aparecerá aqui. Veja como funciona o processo:
                </p>

                {/* How it works */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
                    {HOW_IT_WORKS.map(({ icon: Icon, color, title, desc }, i) => (
                        <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 text-left shadow-sm">
                            <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}>
                                <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Passo {i + 1}</span>
                            </div>
                            <h3 className="text-sm font-semibold text-gray-800 mb-1">{title}</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    // ── With appointments ──
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Meus Agendamentos</h1>
                    <p className="text-sm text-gray-500 mt-1">Suas sessões com o treinador</p>
                </div>
                {upcoming.length > 0 && (
                    <span className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
                        {upcoming.length} próxima{upcoming.length > 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {upcoming.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Próximos</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {upcoming.map(apt => <AppointmentCard key={apt.id} apt={apt} />)}
                    </div>
                </div>
            )}

            {past.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Histórico</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {past.map(apt => <AppointmentCard key={apt.id} apt={apt} faded />)}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
    const { data: session } = useSession()
    const [appointments, setAppointments] = useState([])
    const [loading, setLoading] = useState(true)

    const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)

    const fetchAppointments = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/backend/appointments')
            if (res.ok) {
                const data = await res.json()
                setAppointments(data.appointments ?? [])
            }
        } catch {
            toast.error('Erro ao carregar agendamentos')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchAppointments() }, [fetchAppointments])

    if (isTrainer) {
        return (
            <div className="h-[calc(100vh-120px)] flex flex-col p-0">
                <TrainerWeeklyGrid appointments={appointments} loading={loading} onRefresh={fetchAppointments} />
            </div>
        )
    }

    return <StudentView appointments={appointments} loading={loading} onRefresh={fetchAppointments} />
}
