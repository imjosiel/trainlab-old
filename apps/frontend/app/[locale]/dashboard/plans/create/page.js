'use client'

import { ROLES } from '@/lib/constants'
import { Suspense } from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Sparkles, AlertCircle, CheckCircle2, FileEdit, Search, X } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

function CreatePlanForm() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const preSelectedStudentId = searchParams.get('studentId')
  const t = useTranslations('CreatePlanPage')

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchValue,   setSearchValue]   = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown,  setShowDropdown]  = useState(false)
  const searchDebounceRef  = useRef(null)
  const searchContainerRef = useRef(null)

  // ── Selected student ──────────────────────────────────────────────────────
  const [selectedStudent,   setSelectedStudent]   = useState(null)
  const [selectedProfileId, setSelectedProfileId] = useState('')

  // ── Form ──────────────────────────────────────────────────────────────────
  const [planHorizon,    setPlanHorizon]    = useState('30')   // preset key or 'custom'
  const [customDuration, setCustomDuration] = useState('42')
  const [isManual, setIsManual] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('createPlan_isManual') === 'true'
  })

  const handleSetIsManual = (val) => {
    setIsManual(val)
    localStorage.setItem('createPlan_isManual', String(val))
  }

  const HORIZON_OPTIONS = [
    { value: '7',   label: 'Semanal (1 semana)' },
    { value: '30',  label: 'Mensal (1 mês)' },
    { value: '90',  label: 'Trimestral (3 meses)' },
    { value: '180', label: 'Semestral (6 meses)' },
    { value: '365', label: 'Anual (12 meses)' },
    { value: 'custom', label: 'Personalizado (em dias)' },
  ]

  // Duração efetiva enviada ao backend
  const effectiveDuration = planHorizon === 'custom' ? parseInt(customDuration) || 42 : parseInt(planHorizon)
  const [loading,  setLoading]  = useState(false)

  // Parceiro B2B tem acesso total — não precisa de subscriptionStatus (modelo legado SaaS)
  const isPartnerB2B = session?.user?.roles?.includes(ROLES.PROFESSIONAL) &&
    (session?.user?.roles?.includes(ROLES.PARTNER) || session?.user?.systemRoles?.includes('ADMIN'))
  const hasAccess = isPartnerB2B
    || session?.user?.subscriptionStatus === 'active'
    || session?.user?.subscriptionStatus === 'trialing'

  // ── Auth redirect ─────────────────────────────────────────────────────────
  useEffect(() => {
    const userRoles = session?.user?.roles || []
    if (session && !userRoles.includes(ROLES.PROFESSIONAL)) {
      router.push('/dashboard')
    }
  }, [session, router])

  // ── Load pre-selected student from URL param ───────────────────────────────
  useEffect(() => {
    if (!preSelectedStudentId) return
    fetch('/api/backend/students?search=')
      .then(r => r.json())
      .then(data => {
        const found = (data.students || []).find(s => s.id === preSelectedStudentId)
        if (found) selectStudent(found)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedStudentId])

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Debounced search ───────────────────────────────────────────────────────
  const fetchStudents = useCallback(async (query) => {
    setSearchLoading(true)
    try {
      const res = await fetch(`/api/backend/students?search=${encodeURIComponent(query.trim())}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.students || [])
      }
    } catch { /* ignora */ } finally {
      setSearchLoading(false)
    }
  }, [])

  const handleSearchInput = (value) => {
    setSearchValue(value)
    setShowDropdown(true)
    clearTimeout(searchDebounceRef.current)
    if (!value.trim()) {
      // Campo limpo — mostra todos os alunos sem aguardar
      searchDebounceRef.current = setTimeout(() => fetchStudents(''), 0)
      return
    }
    setSearchLoading(true)
    searchDebounceRef.current = setTimeout(() => fetchStudents(value), 300)
  }

  // ── Select a student from results ──────────────────────────────────────────
  const selectStudent = useCallback((student) => {
    setSelectedStudent(student)
    setSearchValue(student.name)
    setShowDropdown(false)
    setSearchResults([])
    // Pré-selecionar automaticamente se houver apenas 1 perfil
    if (student.profiles?.length === 1) {
      setSelectedProfileId(student.profiles[0].id)
    } else {
      setSelectedProfileId('')
    }
  }, [])

  const clearStudent = () => {
    setSelectedStudent(null)
    setSelectedProfileId('')
    setSearchValue('')
    setSearchResults([])
    // Reabre dropdown com todos os alunos para facilitar nova seleção
    setShowDropdown(true)
    fetchStudents('')
  }

  // ── Perfil selecionado ─────────────────────────────────────────────────────
  const selectedProfile = selectedStudent?.profiles?.find(p => p.id === selectedProfileId)
    ?? (selectedStudent?.profiles?.length === 1 ? selectedStudent.profiles[0] : null)

  // ── Create plan ────────────────────────────────────────────────────────────
  const handleCreatePlan = async () => {
    if (!selectedStudent) { toast.error('Selecione um aluno'); return }
    if (!selectedProfileId) { toast.error('Selecione o esporte e posição do aluno'); return }

    setLoading(true)
    try {
      const response = await fetch('/api/backend/training-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          profileId: selectedProfileId,
          duration:  effectiveDuration,
          isManual,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t('errorCreatePlan'))

      toast.success(t('successCreatePlan'))
      setTimeout(() => router.push(`/dashboard/plans/${data.plan.id}`), 1000)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-1">{t('subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Sparkles className="mr-2 h-5 w-5 text-purple-600" />
            {t('cardTitle')}
          </CardTitle>
          <CardDescription>{t('cardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* ── Busca de Aluno ─────────────────────────────────────────────── */}
          <div>
            <Label htmlFor="student-search">Aluno</Label>
            <div className="relative mt-2" ref={searchContainerRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  id="student-search"
                  value={searchValue}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onFocus={() => {
                    if (!selectedStudent) {
                      // Abre dropdown com todos os alunos ao focar o campo vazio
                      setShowDropdown(true)
                      if (searchResults.length === 0) fetchStudents(searchValue)
                    }
                  }}
                  placeholder="Digite o nome do aluno..."
                  className="pl-9 pr-9"
                  autoComplete="off"
                />
                {searchLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                )}
                {selectedStudent && !searchLoading && (
                  <button
                    type="button"
                    onClick={clearStudent}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Limpar seleção"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Dropdown de resultados */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                  {searchResults.map(student => (
                    <button
                      key={student.id}
                      type="button"
                      className="w-full text-left px-4 py-2.5 hover:bg-purple-50 transition-colors flex items-center gap-3"
                      onMouseDown={(e) => { e.preventDefault(); selectStudent(student) }}
                    >
                      {student.image ? (
                        <img src={student.image} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-purple-700 text-xs font-semibold">{student.name[0]?.toUpperCase()}</span>
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">{student.name}</div>
                        <div className="text-xs text-gray-500">
                          {student.profiles?.length > 0
                            ? student.profiles.map(p => `${p.sportName}${p.position ? ` – ${p.position}` : ''}`).join(' · ')
                            : 'Sem perfil esportivo'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showDropdown && !searchLoading && searchValue && searchResults.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-sm px-4 py-3 text-sm text-gray-500">
                  Nenhum aluno encontrado para &ldquo;{searchValue}&rdquo;
                </div>
              )}
            </div>
          </div>

          {/* ── Seleção de Esporte / Posição (da ficha médica) ─────────────── */}
          {selectedStudent && selectedStudent.profiles?.length > 0 && (
            <div>
              <Label htmlFor="sport-profile">Esporte e Posição</Label>
              <Select
                value={selectedProfileId}
                onValueChange={setSelectedProfileId}
                disabled={selectedStudent.profiles.length === 1}
              >
                <SelectTrigger className="mt-2" id="sport-profile">
                  <SelectValue placeholder="Selecione o esporte e posição..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedStudent.profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      ⚽ {p.sportName}{p.position ? ` – ${p.position}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStudent.profiles.length === 1 && (
                <p className="text-xs text-gray-500 mt-1">Apenas um esporte na ficha médica deste aluno.</p>
              )}
            </div>
          )}

          {/* Sem perfil esportivo */}
          {selectedStudent && (!selectedStudent.profiles || selectedStudent.profiles.length === 0) && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                {t('profileIncompleteWarning')}
              </AlertDescription>
            </Alert>
          )}

          {/* ── Info do Perfil Selecionado ─────────────────────────────────── */}
          {selectedProfile && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>{selectedStudent.name}</strong>
                <div className="mt-2 text-sm space-y-1">
                  <div>⚽ Esporte: <strong>{selectedProfile.sportName || '—'}</strong></div>
                  {selectedProfile.position && (
                    <div>📍 {t('profilePosition')} <strong className="capitalize">{selectedProfile.position}</strong></div>
                  )}
                  {selectedProfile.technicalLevel && (
                    <div>📊 {t('profileLevel')} <strong className="capitalize">{selectedProfile.technicalLevel}</strong></div>
                  )}
                  {selectedProfile.yearsPlaying != null && (
                    <div>⚽ {t('profileExperience')} <strong>{t('profileYears', { years: selectedProfile.yearsPlaying })}</strong></div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* ── Horizonte do Plano ────────────────────────────────────────── */}
          <div>
            <Label htmlFor="plan-horizon">Horizonte do Plano</Label>
            <Select
              value={planHorizon}
              onValueChange={setPlanHorizon}
            >
              <SelectTrigger className="mt-2" id="plan-horizon">
                <SelectValue placeholder="Selecione o horizonte..." />
              </SelectTrigger>
              <SelectContent>
                {HORIZON_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {planHorizon === 'custom' && (
              <div className="mt-3">
                <Label htmlFor="custom-duration">Duração (dias)</Label>
                <Input
                  id="custom-duration"
                  type="number"
                  min="1"
                  max="365"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  className="mt-1"
                  placeholder="Ex: 42"
                />
                <p className="text-xs text-gray-500 mt-1">Entre 1 e 365 dias.</p>
              </div>
            )}

            {planHorizon !== 'custom' && (
              <p className="text-xs text-gray-500 mt-1">
                {effectiveDuration} dias de treino estruturado.
              </p>
            )}
          </div>

          {/* ── Toggle IA vs Manual ───────────────────────────────────────── */}
          <div className="flex flex-row items-center justify-between rounded-lg border p-4 bg-gray-50">
            <div className="space-y-0.5">
              <Label className="text-base">{t('labelManual')}</Label>
              <p className="text-xs text-gray-500">{t('descManual')}</p>
            </div>
            <Switch checked={isManual} onCheckedChange={handleSetIsManual} />
          </div>

          {/* ── Subscription Warning ──────────────────────────────────────── */}
          {!hasAccess && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {t('subWarningText')}{' '}
                <Button
                  variant="link"
                  className="ml-2 p-0 h-auto text-red-600 underline"
                  onClick={() => router.push('/dashboard/subscription')}
                >
                  {t('btnSubscribe')}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* ── Action Button ────────────────────────────────────────────── */}
          <div className="pt-4">
            <Button
              onClick={handleCreatePlan}
              disabled={loading || !selectedStudent || !selectedProfileId || !hasAccess}
              className="w-full bg-purple-600 hover:bg-purple-700 py-6 text-lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {isManual ? t('btnLoadingManual') : t('btnLoadingAI')}
                </>
              ) : (
                <>
                  {isManual ? <FileEdit className="mr-2 h-5 w-5" /> : <Sparkles className="mr-2 h-5 w-5" />}
                  {isManual ? t('btnStartManual') : t('btnGenerateAI')}
                </>
              )}
            </Button>
            {loading && !isManual && (
              <p className="text-center text-sm text-gray-500 mt-3">{t('hintAILoading')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function CreatePlanPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    }>
      <CreatePlanForm />
    </Suspense>
  )
}