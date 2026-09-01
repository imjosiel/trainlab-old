'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Trophy, ArrowRight, ArrowLeft, Loader2, CheckCircle2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { ROLES } from '@/lib/constants'
import TermsCheckbox from '@/components/terms-checkbox'

export default function OnboardingWizard() {
  const { data: session, update } = useSession()
  const router = useRouter()

  // Invite data from trainer
  const [inviteData, setInviteData]         = useState(null)   // { trainerName, trainerImage, sport, position, ... }
  const [inviteAccepted, setInviteAccepted] = useState(false)  // true = user clicked "Aceitar convite"
  const [loadingInvite, setLoadingInvite]   = useState(true)

  // Wizard state
  // Steps: 0 (invite banner, conditional) → 1 (role) → 2 (sports) → 3 (physical) → 4 (trainer link)
  const [step, setStep]     = useState(null)   // null = still loading invite
  const [loading, setLoading] = useState(false)
  const [loadingSports, setLoadingSports] = useState(true)
  const [availableSports, setAvailableSports] = useState([])
  const [settings, setSettings] = useState(null)

  // Form state
  const [selectedRole, setSelectedRole]     = useState(null)
  const [selectedSports, setSelectedSports] = useState([])
  const [dateOfBirth, setDateOfBirth]       = useState('')
  const [height, setHeight]                 = useState('')
  const [weight, setWeight]                 = useState('')
  const [trainerCode, setTrainerCode]       = useState('')
  const [phone, setPhone]                   = useState('')
  const [termsAccepted, setTermsAccepted]    = useState(false)

  // ─── Load invite + settings + sports ──────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/backend/onboarding').then(r => r.ok ? r.json() : { pendingInvite: null }),
      fetch('/api/backend/public/modules').then(r => r.ok ? r.json() : null),
      fetch('/api/backend/sports').then(r => r.ok ? r.json() : { sports: [] }),
    ]).then(([inviteRes, settingsRes, sportsRes]) => {
      if (settingsRes) setSettings(settingsRes)
      setAvailableSports(sportsRes.sports || [])
      setLoadingSports(false)

      const invite = inviteRes.pendingInvite
      if (invite) {
        setInviteData(invite)
        setStep(0)                              // show invite banner first
      } else {
        setStep(1)                              // no invite → straight to role selection
      }
      setLoadingInvite(false)
    }).catch(err => {
      console.error('[Onboarding]', err)
      setLoadingInvite(false)
      setStep(1)
    })
  }, [])


  // ─── Accept invite ─────────────────────────────────────────────────────────
  const handleAcceptInvite = () => {
    setInviteAccepted(true)
    setSelectedRole(ROLES.CLIENT)

    // Pre-fill sport from invite
    if (inviteData.sport?.id) {
      setSelectedSports([inviteData.sport.id])
    }
    // Pre-fill physical data if available
    if (inviteData.dateOfBirth) setDateOfBirth(inviteData.dateOfBirth.substring(0, 10))
    if (inviteData.height)      setHeight(String(inviteData.height))
    if (inviteData.weight)      setWeight(String(inviteData.weight))

    setStep(2) // skip role selection → go straight to sports confirmation
    toast.success(`Convite de ${inviteData.trainerName} aceito! Agora confirme seus dados.`)
  }

  const handleIgnoreInvite = () => {
    setInviteAccepted(false)
    setStep(1)
  }

  // ─── Navigation ────────────────────────────────────────────────────────────
  const isTrainerRole = selectedRole === ROLES.PROFESSIONAL || selectedRole === ROLES.PARTNER
  const isAffiliateRole = selectedRole === ROLES.AFFILIATE

  const handleNext = () => {
    // Afiliado: step 1 → submit direto (sem sports/physical)
    if (isAffiliateRole && step === 1) {
      handleSubmit()
      return
    }
    if (isTrainerRole && step === 1) {
      setStep(5) // step 5 = telefone do treinador
      return
    }
    if (isTrainerRole && step === 5) {
      if (!phone.trim()) { toast.error('Telefone é obrigatório para treinadores.'); return }
      handleSubmit()
      return
    }
    setStep(s => s + 1)
  }
  const handleBack = () => {
    if (isTrainerRole && step === 5) { setStep(1); return }
    setStep(s => s - 1)
  }

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!termsAccepted) return
    setLoading(true)
    try {
      const payload = {
        role: selectedRole,
        sports: selectedSports,
        dateOfBirth,
        height,
        weight,
        trainerCode,
        phone,
      }

      const res  = await fetch('/api/backend/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro na configuração')

      const updatedSession = await update()
      toast.success('Perfil configurado!')
      // Se a sessão ainda está com PENDING após o update(), aguarda para o JWT processar
      // o trigger='update' antes do redirect — evita que o tour rode com roles incorretas.
      if (!updatedSession?.user?.roles || updatedSession.user.roles.includes('PENDING')) {
        await new Promise(r => setTimeout(r, 1500))
      }
      window.location.href = '/dashboard'
    } catch (err) {
      toast.error(err.message)
      setLoading(false)
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const toggleSport = (id) =>
    setSelectedSports(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const trainerInitials = (name) =>
    name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'

  const totalSteps = inviteAccepted ? 3 : 4   // sem step 0 (j√° passou) e sem step 1 (role fixo)

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (!session || loadingInvite || step === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    )
  }

  // ─── Step indicators ───────────────────────────────────────────────────────
  // Steps visíveis para o usuário: se aceitou convite = [2,3,4], senão = [1,2,3,4]
  const visibleSteps = inviteAccepted ? [2, 3, 4] : [1, 2, 3, 4]
  const currentVisibleIdx = visibleSteps.indexOf(step)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50/50 p-4">
      <div className="w-full max-w-2xl">

        {/* Progress dots (only for steps 1–4) */}
        {step > 0 && (
          <div className="mb-8 flex justify-center items-center space-x-4">
            {visibleSteps.map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'w-16 bg-green-600'
                    : s < step
                    ? 'w-8 bg-green-200'
                    : 'w-8 bg-gray-200'
                }`}
              />
            ))}
          </div>
        )}

        <Card className="shadow-lg border-0 ring-1 ring-gray-200/50">
          {/* ── Header ─────────────────────────────────────────────────── */}
          <CardHeader className="text-center pb-8 border-b border-gray-100 bg-white rounded-t-xl">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-6 transform -rotate-6">
              <Trophy className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-3xl font-bold text-gray-900 tracking-tight">
              {step === 0 && '🎓 Convite Identificado!'}
              {step === 1 && 'Qual o seu Objetivo?'}
              {step === 2 && (inviteAccepted ? 'Confirme seus Esportes' : 'Seus Esportes')}
              {step === 3 && 'Informações Físicas'}
              {step === 4 && (inviteAccepted ? 'Tudo Pronto!' : 'Conexão com Treinador')}
            </CardTitle>
            <CardDescription className="text-base mt-3 text-gray-500">
              {step === 0 && 'Encontramos um treinador que já te cadastrou na plataforma.'}
              {step === 1 && 'Como você pretende utilizar a plataforma?'}
              {step === 2 && (inviteAccepted
                ? `Esporte selecionado pelo treinador ${inviteData?.trainerName}. Ajuste se precisar.`
                : 'Selecione as modalidades que você pratica'
              )}
              {step === 3 && 'Esses dados nos ajudam a gerar treinos mais precisos. Não são obrigatórios.'}
              {step === 4 && (inviteAccepted
                ? `Você está conectado com ${inviteData?.trainerName}. Clique em Concluir para finalizar.`
                : 'Já foi convidado por um professor? Adicione o email dele aqui.'
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-8 px-6 sm:px-10 pb-10 bg-white">

            {/* ── Step 0: Invite Banner ──────────────────────────────────── */}
            {step === 0 && inviteData && (
              <div className="space-y-6">
                {/* Trainer card */}
                <div className="flex items-center gap-4 p-5 bg-purple-50 rounded-2xl border border-purple-100">
                  <Avatar className="h-14 w-14 ring-2 ring-purple-200">
                    <AvatarImage src={inviteData.trainerImage} />
                    <AvatarFallback className="bg-purple-600 text-white text-lg font-bold">
                      {trainerInitials(inviteData.trainerName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold text-gray-900 text-lg leading-tight">{inviteData.trainerName}</p>
                    <p className="text-sm text-purple-700 mt-0.5">Treinador na Player.Action</p>
                    {inviteData.sport && (
                      <span className="inline-block mt-1 bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                        {inviteData.sport.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* What will happen */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">Ao aceitar o convite:</p>
                  {[
                    inviteData.sport ? `🏅 Esporte "${inviteData.sport.name}" já pré-selecionado` : null,
                    inviteData.height || inviteData.weight ? '📋 Dados físicos pré-preenchidos' : null,
                    '🔗 Sua conta será vinculada automaticamente ao treinador',
                    '🔔 O treinador receberá uma notificação de conexão',
                  ].filter(Boolean).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    onClick={handleAcceptInvite}
                    className="flex-1 h-12 bg-purple-600 hover:bg-purple-700 text-white text-base font-semibold"
                  >
                    <UserCheck className="w-5 h-5 mr-2" />
                    Aceitar convite de {inviteData.trainerName?.split(' ')[0]}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleIgnoreInvite}
                    className="h-12 text-gray-500 border-gray-200"
                  >
                    Criar conta separada
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 1: Role selection ─────────────────────────────────── */}
            {step === 1 && settings && (
              <div className="grid sm:grid-cols-2 gap-4">
                {settings.moduleAthleteEnabled && (
                  <div
                    className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedRole === ROLES.INDIVIDUAL ? 'border-green-600 bg-green-50/50 shadow-sm' : 'border-gray-200 hover:border-green-300 hover:bg-gray-50'}`}
                    onClick={() => setSelectedRole(ROLES.INDIVIDUAL)}
                  >
                    {selectedRole === ROLES.INDIVIDUAL && <CheckCircle2 className="absolute top-4 right-4 w-6 h-6 text-green-600" />}
                    <div className="text-2xl mb-3">🏃‍♂️</div>
                    <h3 className="font-semibold text-gray-900 mb-1">Sou Atleta Independente</h3>
                    <p className="text-sm text-gray-500">Vou usar a IA para gerar meus próprios treinos.</p>
                  </div>
                )}
                {settings.moduleCoachEnabled && (
                  <div
                    className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedRole === ROLES.PROFESSIONAL ? 'border-blue-600 bg-blue-50/50 shadow-sm' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
                    onClick={() => setSelectedRole(ROLES.PROFESSIONAL)}
                  >
                    {selectedRole === ROLES.PROFESSIONAL && <CheckCircle2 className="absolute top-4 right-4 w-6 h-6 text-blue-600" />}
                    <div className="text-2xl mb-3">👨‍🏫</div>
                    <h3 className="font-semibold text-gray-900 mb-1">Sou Treinador de Atletas</h3>
                    <p className="text-sm text-gray-500">Quero adicionar atletas e enviar planos de treino.</p>
                  </div>
                )}
                {settings.modulePartnerB2BEnabled && (
                  <div
                    className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedRole === ROLES.PARTNER ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}`}
                    onClick={() => setSelectedRole(ROLES.PARTNER)}
                  >
                    {selectedRole === ROLES.PARTNER && <CheckCircle2 className="absolute top-4 right-4 w-6 h-6 text-indigo-600" />}
                    <div className="text-2xl mb-3">💼</div>
                    <h3 className="font-semibold text-gray-900 mb-1">Sou Treinador Parceiro B2B</h3>
                    <p className="text-sm text-gray-500">Quero vender assinaturas e escalar minha operação.</p>
                  </div>
                )}
                {(settings.moduleCoachEnabled || settings.modulePartnerB2BEnabled) && (
                  <div
                    className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedRole === ROLES.CLIENT ? 'border-purple-600 bg-purple-50/50 shadow-sm' : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'}`}
                    onClick={() => setSelectedRole(ROLES.CLIENT)}
                  >
                    {selectedRole === ROLES.CLIENT && <CheckCircle2 className="absolute top-4 right-4 w-6 h-6 text-purple-600" />}
                    <div className="text-2xl mb-3">🎓</div>
                    <h3 className="font-semibold text-gray-900 mb-1">Sou Aluno de um Treinador</h3>
                    <p className="text-sm text-gray-500">Quero acessar os treinos enviados pelo meu professor.</p>
                  </div>
                )}

                <div
                  className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedRole === ROLES.AFFILIATE ? 'border-pink-600 bg-pink-50/50 shadow-sm' : 'border-gray-200 hover:border-pink-300 hover:bg-gray-50'}`}
                  onClick={() => setSelectedRole(ROLES.AFFILIATE)}
                >
                  {selectedRole === ROLES.AFFILIATE && <CheckCircle2 className="absolute top-4 right-4 w-6 h-6 text-pink-600" />}
                  <div className="text-2xl mb-3">🔗</div>
                  <h3 className="font-semibold text-gray-900 mb-1">Sou Afiliado</h3>
                  <p className="text-sm text-gray-500">Quero indicar parceiros e ganhar comissão recorrente.</p>
                </div>
              </div>
            )}

            {/* ── Step 2: Sports ─────────────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <Label className="text-lg">Modalidades Praticadas</Label>
                {inviteData?.sport && inviteAccepted && (
                  <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-lg px-4 py-3 text-sm text-purple-800">
                    <CheckCircle2 className="w-4 h-4 text-purple-500 shrink-0" />
                    Esporte <strong>{inviteData.sport.name}</strong> selecionado pelo seu treinador
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  {loadingSports ? (
                    <div className="col-span-full py-8 flex flex-col items-center gap-2 border border-dashed rounded-lg">
                      <Loader2 className="w-5 h-5 animate-spin text-green-600" />
                      <p className="text-xs text-slate-400">Carregando modalidades...</p>
                    </div>
                  ) : (
                    availableSports.map(sport => (
                      <div
                        key={sport.id}
                        className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer transition-all ${
                          selectedSports.includes(sport.id)
                            ? 'border-green-400 bg-green-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => toggleSport(sport.id)}
                      >
                        <Checkbox
                          checked={selectedSports.includes(sport.id)}
                          onCheckedChange={() => toggleSport(sport.id)}
                          id={sport.id}
                        />
                        <Label htmlFor={sport.id} className="font-medium cursor-pointer flex-1">
                          {sport.name}
                          {inviteData?.sport?.id === sport.id && inviteAccepted && (
                            <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 rounded px-1">Do treinador</span>
                          )}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── Step 3: Physical data ──────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-6">
                {inviteAccepted && (inviteData?.height || inviteData?.weight || inviteData?.dateOfBirth) && (
                  <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-lg px-4 py-3 text-sm text-purple-800">
                    <CheckCircle2 className="w-4 h-4 text-purple-500 shrink-0" />
                    Dados pré-preenchidos pelo seu treinador. Edite se necessário.
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Data de Nascimento <span className="text-gray-400 font-normal">(opcional)</span></Label>
                  <Input type="date" id="dateOfBirth" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} className="h-12 text-lg" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="height">Altura (cm) <span className="text-gray-400 font-normal">(opcional)</span></Label>
                    <Input type="number" id="height" placeholder="Ex: 175" value={height} onChange={e => setHeight(e.target.value)} className="h-12 text-lg" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weight">Peso (kg) <span className="text-gray-400 font-normal">(opcional)</span></Label>
                    <Input type="number" id="weight" placeholder="Ex: 70" value={weight} onChange={e => setWeight(e.target.value)} className="h-12 text-lg" />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 5: Telefone do treinador ─────────────────────────── */}
            {step === 5 && (
              <div className="space-y-6">
            <div className="space-y-2">
                  <Label htmlFor="phone">
                    Telefone / WhatsApp <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="tel"
                    id="phone"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={e => {
                      // Máscara BR: (00) 00000-0000
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
                      const masked = digits.length <= 10
                        ? digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
                        : digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
                      setPhone(masked)
                    }}
                    className="h-12 text-lg"
                  />
                  <p className="text-xs text-gray-400">Somente números com DDD. Ex: (51) 99999-9999</p>
                </div>
              </div>
            )}

            {/* ── Step 4: Trainer link ───────────────────────────────────── */}
            {step === 4 && (
              <div className="space-y-6">
                {inviteAccepted ? (
                  /* ── Invite accepted variant ── */
                  <div className="flex items-center gap-4 p-5 bg-green-50 rounded-2xl border border-green-100">
                    <Avatar className="h-14 w-14 ring-2 ring-green-200">
                      <AvatarImage src={inviteData?.trainerImage} />
                      <AvatarFallback className="bg-green-600 text-white text-lg font-bold">
                        {trainerInitials(inviteData?.trainerName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900 text-lg leading-tight">{inviteData?.trainerName}</p>
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      </div>
                      <p className="text-sm text-green-700 mt-0.5">Você será vinculado automaticamente ao concluir.</p>
                    </div>
                  </div>
                ) : (
                  /* ── No invite variant ── */
                  <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 mb-6">
                    <h4 className="text-base font-semibold text-blue-900 mb-2">Já tem um professor na plataforma?</h4>
                    <p className="text-sm text-blue-700 mb-4">
                      Insira o email dele abaixo para enviar uma solicitação.{' '}
                      <strong>Se ele já te cadastrou com este e-mail ({session.user.email}), o sistema vinculará automaticamente!</strong>
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="trainerCode">Email do Treinador <span className="text-gray-400 font-normal">(opcional)</span></Label>
                      <Input
                        type="email"
                        id="trainerCode"
                        placeholder="treinador@email.com"
                        value={trainerCode}
                        onChange={e => setTrainerCode(e.target.value)}
                        className="h-12 text-lg bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Terms checkbox (final steps only) ──────────────────── */}
            {((step === 1 && isAffiliateRole) ||
              (step === 5 && isTrainerRole) ||
              (step === 4 && !isTrainerRole && !isAffiliateRole)) && (
              <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} variant="signup" className="mt-6" />
            )}

          </CardContent>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          {step > 0 && (
            <CardFooter className="flex justify-between p-6 sm:px-10 bg-gray-50/50 border-t border-gray-100 rounded-b-xl">
              {/* Back button */}
              {step > 1 ? (
                <Button variant="outline" onClick={handleBack} className="h-11 px-6">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
              ) : (
                <div />
              )}

              {/* Next / Finish button */}
              {step === 1 && isAffiliateRole ? (
                <Button
                  onClick={handleNext}
                  disabled={!termsAccepted || loading}
                  className="h-11 px-8 bg-green-600 hover:bg-green-700 text-white"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Concluir
                </Button>
              ) : step < 4 && (selectedRole === ROLES.INDIVIDUAL || selectedRole === ROLES.CLIENT || !selectedRole) ? (
                <Button
                  onClick={handleNext}
                  className="h-11 px-8 bg-black hover:bg-gray-800 text-white"
                  disabled={step === 1 && !selectedRole}
                >
                  Avançar
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : step === 1 && isTrainerRole ? (
                <Button
                  onClick={handleNext}
                  className="h-11 px-8 bg-black hover:bg-gray-800 text-white"
                >
                  Avançar
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={step === 5 ? handleNext : handleSubmit}
                  disabled={!termsAccepted || loading || (step === 5 && !phone.trim())}
                  className="h-11 px-8 bg-green-600 hover:bg-green-700 text-white"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Concluir
                </Button>
              )}
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  )
}


