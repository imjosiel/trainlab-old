'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Clock, MapPin, User, CalendarDays, Loader2, AlertCircle, BadgeCheck } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ─── Estados possíveis ─────────────────────────────────────────────────────────

const SCREENS = {
  LOADING:           'loading',
  DETAILS:           'details',           // link válido — mostra detalhes
  DONE_CONFIRMED:    'done_confirmed',    // aluno confirmou
  DONE_CANCELED:     'done_canceled',     // aluno cancelou
  ALREADY_CONFIRMED: 'already_confirmed', // já estava confirmado
  EXPIRED:           'expired',           // link expirado (horário passou)
  CANCELED:          'canceled',          // agendamento já cancelado
  INVALID:           'invalid',           // token inválido
  ERROR:             'error',
}

export default function ConfirmAppointmentPage() {
  const { token } = useParams()
  const [screen, setScreen]           = useState(SCREENS.LOADING)
  const [appointment, setAppointment] = useState(null)
  const [submitting, setSubmitting]   = useState(false)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/backend/appointments/confirm/${token}`)
      const data = await res.json()

      if (!res.ok) {
        const map = {
          INVALID:           SCREENS.INVALID,
          ALREADY_CONFIRMED: SCREENS.ALREADY_CONFIRMED,
          EXPIRED:           SCREENS.EXPIRED,
          CANCELED:          SCREENS.CANCELED,
          COMPLETED:         SCREENS.ALREADY_CONFIRMED,
        }
        setScreen(map[data.error] ?? SCREENS.INVALID)
        return
      }
      setAppointment(data.appointment)
      setScreen(SCREENS.DETAILS)
    } catch {
      setScreen(SCREENS.ERROR)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const handleAction = async (action) => {
    setSubmitting(true)
    try {
      const res  = await fetch(`/api/backend/appointments/confirm/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        const map = { EXPIRED: SCREENS.EXPIRED, ALREADY_CONFIRMED: SCREENS.ALREADY_CONFIRMED }
        setScreen(map[data.error] ?? SCREENS.ERROR)
        return
      }
      setScreen(action === 'confirm' ? SCREENS.DONE_CONFIRMED : SCREENS.DONE_CANCELED)
    } catch {
      setScreen(SCREENS.ERROR)
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-green-50/30 flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-gray-900 tracking-tight">Player.Action</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">

        {/* ── Loading ── */}
        {screen === SCREENS.LOADING && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            <p className="text-sm text-gray-500">Carregando agendamento...</p>
          </div>
        )}

        {/* ── Detalhes ── */}
        {screen === SCREENS.DETAILS && appointment && (
          <>
            <div className="bg-green-600 px-6 py-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-widest text-green-200 mb-1">Confirmação de Sessão</p>
              <h1 className="text-xl font-bold leading-tight">{appointment.title}</h1>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <CalendarDays className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold">{format(new Date(appointment.scheduledAt), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                  <p className="text-gray-500">{format(new Date(appointment.scheduledAt), 'HH:mm')} · {appointment.durationMinutes} minutos</p>
                </div>
              </div>
              {appointment.location && (
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <span>{appointment.location}</span>
                </div>
              )}
              {appointment.trainer && (
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <span>Treinador: <strong>{appointment.trainer.name}</strong></span>
                </div>
              )}
              {appointment.description && (
                <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3 leading-relaxed">{appointment.description}</p>
              )}

              <div className="pt-2 flex gap-3">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
                  onClick={() => handleAction('confirm')}
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar presença
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-red-200 text-red-600 hover:bg-red-50 gap-2"
                  onClick={() => handleAction('cancel')}
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Não vou
                </Button>
              </div>
              <p className="text-center text-[11px] text-gray-400">Este link é de uso único e expira no horário da sessão.</p>
            </div>
          </>
        )}

        {/* ── Confirmado ── */}
        {screen === SCREENS.DONE_CONFIRMED && (
          <div className="flex flex-col items-center py-14 px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <BadgeCheck className="w-9 h-9 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Presença confirmada!</h2>
            <p className="text-sm text-gray-500 max-w-xs">Ótimo! Seu treinador foi notificado. Até a sessão 💪</p>
          </div>
        )}

        {/* ── Cancelado ── */}
        {screen === SCREENS.DONE_CANCELED && (
          <div className="flex flex-col items-center py-14 px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="w-9 h-9 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Presença cancelada</h2>
            <p className="text-sm text-gray-500 max-w-xs">Tudo certo. Seu treinador foi avisado sobre o cancelamento.</p>
          </div>
        )}

        {/* ── Já confirmado ── */}
        {screen === SCREENS.ALREADY_CONFIRMED && (
          <div className="flex flex-col items-center py-14 px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <BadgeCheck className="w-9 h-9 text-blue-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Já confirmado</h2>
            <p className="text-sm text-gray-500 max-w-xs">Este agendamento já foi confirmado anteriormente. Nenhuma ação necessária.</p>
          </div>
        )}

        {/* ── Expirado ── */}
        {screen === SCREENS.EXPIRED && (
          <div className="flex flex-col items-center py-14 px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="w-9 h-9 text-amber-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Link expirado</h2>
            <p className="text-sm text-gray-500 max-w-xs">O prazo para confirmar esta sessão já passou. Entre em contato com seu treinador.</p>
          </div>
        )}

        {/* ── Cancelado (agendamento) ── */}
        {screen === SCREENS.CANCELED && (
          <div className="flex flex-col items-center py-14 px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <AlertCircle className="w-9 h-9 text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Agendamento cancelado</h2>
            <p className="text-sm text-gray-500 max-w-xs">Este agendamento foi cancelado. Fale com seu treinador para remarcar.</p>
          </div>
        )}

        {/* ── Inválido / Erro ── */}
        {(screen === SCREENS.INVALID || screen === SCREENS.ERROR) && (
          <div className="flex flex-col items-center py-14 px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-9 h-9 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              {screen === SCREENS.ERROR ? 'Erro ao carregar' : 'Link inválido'}
            </h2>
            <p className="text-sm text-gray-500 max-w-xs">
              {screen === SCREENS.ERROR
                ? 'Ocorreu um erro. Tente novamente em instantes.'
                : 'Este link não é válido ou já foi utilizado.'}
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-6">Player.Action · Plataforma de treinamento</p>
    </div>
  )
}
