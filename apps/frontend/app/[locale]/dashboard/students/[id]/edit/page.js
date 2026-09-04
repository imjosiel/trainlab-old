'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { toast } from 'sonner'
import { TeamAutocomplete } from '@/components/ui/team-autocomplete'
import { ROLES } from '@/lib/constants'

const STEPS = [
    { id: 1, name: 'Dados Básicos', description: 'Informações pessoais' },
    { id: 2, name: 'Dados Físicos', description: 'Características físicas' },
    { id: 3, name: 'Saúde', description: 'Restrições e medicações' },
    { id: 4, name: 'Esportes', description: 'Esportes e Objetivos' },
]

// removed static SPORTS

// Positions are loaded dynamically from the API via availableSports

const TECHNICAL_LEVELS = [
    { value: 'iniciante', label: 'Iniciante' },
    { value: 'intermediario', label: 'Intermediário' },
    { value: 'avancado', label: 'Avançado' },
    { value: 'profissional', label: 'Profissional' },
]

const TRAINING_FOCUS = [
    { value: 'fisico', label: 'Físico' },
    { value: 'tecnico', label: 'Técnico' },
    { value: 'tatico', label: 'Tático' },
    { value: 'recuperacao', label: 'Recuperação' },
]

export default function StudentProfileEditPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const params = useParams()
    const searchParams = useSearchParams()
    const studentId = params.id
    const urlSportId = searchParams.get('sportId')
    const t = useTranslations('AthleteDetailPage') // Reutilizando chaves se possível, senão chumba pt-BR

    const [currentStep, setCurrentStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [loadingStudent, setLoadingStudent] = useState(true)
    const [studentName, setStudentName] = useState('')
    const [availableSports, setAvailableSports] = useState([])

    const [formData, setFormData] = useState({
        sports: urlSportId ? [{ sportId: urlSportId, position: '', dominantFoot: '', technicalLevel: '', yearsPlaying: '', teams: [], goals: '', trainingDaysPerWeek: '', trainingHoursPerDay: '', trainingFocus: [] }] : [],
        dateOfBirth: '',
        height: '',
        weight: '',
        injuryHistory: '',
        currentInjuries: '',
        hasHealthIssues: false,
        healthIssuesDesc: '',
        takesMedication: false,
        medicationDesc: '',
        acceptedTerms: false,
        strengths: '',
        weaknesses: '',
    })

    const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)

    useEffect(() => {
        if (session && !isTrainer) {
            router.push('/dashboard')
            return
        }
        if (session) {
            fetchSports()
            fetchStudentAndProfile()
        }
    }, [session, studentId, urlSportId])

    const fetchSports = async () => {
        try {
            const res = await fetch('/api/backend/sports')
            if (res.ok) {
                const data = await res.json()
                setAvailableSports(data.sports || [])
            }
        } catch (err) { console.error('Error fetching sports:', err) }
    }

    const fetchStudentAndProfile = async () => {
        try {
            const res = await fetch(`/api/backend/students/${studentId}`)
            if (res.ok) {
                const data = await res.json()
                setStudentName(data.student.name)

                if (data.student.profiles?.length > 0) {
                    const mappedSports = data.student.profiles.map(p => ({
                        sportId: p.sportId || '',
                        position: p.position || '',
                        dominantFoot: p.dominantFoot || '',
                        technicalLevel: p.technicalLevel || '',
                        yearsPlaying: p.yearsPlaying || '',
                        teams: p.teams ? p.teams.map(t => t.name) : [],
                        goals: p.goals || '',
                        trainingDaysPerWeek: p.trainingDaysPerWeek || '',
                        trainingHoursPerDay: p.trainingHoursPerDay || '',
                        trainingFocus: p.trainingFocus || [],
                    }))

                    const firstProfile = data.student.profiles[0] // pick global fields from the first one

                    setFormData({
                        sports: mappedSports,
                        dateOfBirth: firstProfile.dateOfBirth ? new Date(firstProfile.dateOfBirth).toISOString().split('T')[0] : '',
                        height: firstProfile.height || '',
                        weight: firstProfile.weight || '',
                        injuryHistory: firstProfile.injuryHistory || '',
                        currentInjuries: firstProfile.currentInjuries || '',
                        hasHealthIssues: firstProfile.hasHealthIssues || false,
                        healthIssuesDesc: firstProfile.healthIssuesDesc || '',
                        takesMedication: firstProfile.takesMedication || false,
                        medicationDesc: firstProfile.medicationDesc || '',
                        acceptedTerms: firstProfile.acceptedTerms || false,
                        strengths: firstProfile.strengths || '',
                        weaknesses: firstProfile.weaknesses || '',
                    })
                }
            } else {
                toast.error('Aluno não encontrado')
                router.push('/dashboard/students')
            }
        } catch (error) {
            console.error('Error fetching student profile:', error)
        } finally {
            setLoadingStudent(false)
        }
    }

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleSportTrainingFocusToggle = (index, value) => {
        setFormData(prev => {
            const newSports = [...prev.sports]
            const sportTarget = { ...newSports[index] }
            const current = sportTarget.trainingFocus || []
            if (current.includes(value)) {
                sportTarget.trainingFocus = current.filter(v => v !== value)
            } else {
                sportTarget.trainingFocus = [...current, value]
            }
            newSports[index] = sportTarget
            return { ...prev, sports: newSports }
        })
    }

    const handleAddSport = () => {
        setFormData(prev => ({
            ...prev,
            sports: [
                ...prev.sports,
                { sportId: '', position: '', dominantFoot: '', technicalLevel: '', yearsPlaying: '', teams: [], goals: '', trainingDaysPerWeek: '', trainingHoursPerDay: '', trainingFocus: [] }
            ]
        }))
    }

    const handleRemoveSport = (index) => {
        setFormData(prev => ({
            ...prev,
            sports: prev.sports.filter((_, i) => i !== index)
        }))
    }

    const handleSportChange = (index, field, value) => {
        setFormData(prev => {
            const newSports = [...prev.sports]
            newSports[index] = { ...newSports[index], [field]: value }
            if (field === 'sportId') {
                newSports[index].position = ''
            }
            return { ...prev, sports: newSports }
        })
    }

    const validateStep = () => {
        if (currentStep === 1) {
            if (!formData.dateOfBirth) return 'Data de nascimento é obrigatória'
        }
        if (currentStep === 3) {
            if (!formData.acceptedTerms) return 'Você deve aceitar o termo de responsabilidade'
            if (formData.hasHealthIssues && (!formData.healthIssuesDesc || !formData.healthIssuesDesc.trim())) return 'Descreva os problemas de saúde'
            if (formData.takesMedication && (!formData.medicationDesc || !formData.medicationDesc.trim())) return 'Descreva as medicações'
        }
        if (currentStep === 4) {
            if (!formData.sports || formData.sports.length === 0) return 'Adicione pelo menos um esporte'
            for (let i = 0; i < formData.sports.length; i++) {
                const s = formData.sports[i]
                if (!s.sportId) return `Selecione o esporte no item ${i + 1}`
                const sportPositions = availableSports.find(sp => sp.id === s.sportId)?.positions || []
                if (sportPositions.length > 0 && !s.position) return `A posição é obrigatória no item ${i + 1}`
                if (!s.technicalLevel) return `O nível técnico é obrigatório no item ${i + 1}`
                if (!s.yearsPlaying) return `Tempo de prática é obrigatório no item ${i + 1}`
                if (!s.dominantFoot) return `Pé/Mão Dominante é obrigatório no item ${i + 1}`
                if (!s.goals || !s.goals.trim()) return `Os objetivos são obrigatórios no item ${i + 1}`
                if (!s.trainingDaysPerWeek) return `Os dias de treino são obrigatórios no item ${i + 1}`
                if (!s.trainingHoursPerDay) return `As horas por dia são obrigatórias no item ${i + 1}`
                if (!s.trainingFocus || s.trainingFocus.length === 0) return `Selecione pelo menos um foco de treino no item ${i + 1}`
            }
            const selectedSports = formData.sports.map(s => s.sportId)
            const uniqueSports = new Set(selectedSports)
            if (uniqueSports.size !== selectedSports.length) {
                return 'Você não pode adicionar o mesmo esporte mais de uma vez'
            }
        }
        return null
    }

    const handleNext = () => {
        const error = validateStep()
        if (error) {
            toast.error(error)
            return
        }
        setCurrentStep(prev => prev + 1)
    }

    const handleFinalSubmit = async () => {
        const error = validateStep()
        if (error) {
            toast.error(error)
            return
        }
        await handleSubmit()
    }

    const handleSubmit = async () => {
        setLoading(true)
        try {
            const response = await fetch(`/api/backend/students/${studentId}/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            })

            if (!response.ok) {
                throw new Error('Erro ao salvar perfil do aluno')
            }

            toast.success('Perfil do aluno salvo com sucesso!')
            router.push(`/dashboard/students/${studentId}`)
        } catch (error) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    if (loadingStudent) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto py-8">
            <Button variant="ghost" className="mb-6" onClick={() => router.push(`/dashboard/students/${studentId}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o Aluno
            </Button>

            {/* Stepper */}
            <div className="mb-8 hidden sm:block">
                <div className="flex items-center justify-between">
                    {STEPS.map((step, index) => (
                        <div key={step.id} className="flex items-center flex-1">
                            <div className="flex flex-col items-center">
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center ${currentStep > step.id
                                        ? 'bg-purple-600 text-white'
                                        : currentStep === step.id
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-gray-200 text-gray-600'
                                        }`}
                                >
                                    {currentStep > step.id ? <Check className="w-5 h-5" /> : step.id}
                                </div>
                                <div className="mt-2 text-center">
                                    <div className="text-sm font-medium text-gray-900">{step.name}</div>
                                    <div className="text-xs text-gray-500 whitespace-nowrap">{step.description}</div>
                                </div>
                            </div>
                            {index < STEPS.length - 1 && (
                                <div
                                    className={`h-1 flex-1 mx-4 ${currentStep > step.id ? 'bg-purple-600' : 'bg-gray-200'
                                        }`}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="mb-6 sm:hidden">
                <p className="text-sm font-medium text-gray-500 text-center">Passo {currentStep} de {STEPS.length}</p>
                <h2 className="text-xl font-bold text-center mt-1">{STEPS[currentStep - 1].name}</h2>
            </div>

            {/* Form */}
            <Card>
                <CardHeader>
                    <CardTitle>Editar Ficha de {studentName}</CardTitle>
                    <CardDescription>
                        Preencha as informações do aluno para gerar treinos otimizados com IA
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Step 1: Dados Básicos */}
                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <div className="max-w-md">
                                <Label htmlFor="dateOfBirth">Data de Nascimento *</Label>
                                <Input
                                    id="dateOfBirth"
                                    type="date"
                                    value={formData.dateOfBirth}
                                    onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 2: Dados Físicos */}
                    {currentStep === 2 && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="height">Altura (cm)</Label>
                                    <Input
                                        id="height"
                                        type="number"
                                        step="0.1"
                                        value={formData.height}
                                        onChange={(e) => handleChange('height', e.target.value)}
                                        placeholder="175"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="weight">Peso (kg)</Label>
                                    <Input
                                        id="weight"
                                        type="number"
                                        step="0.1"
                                        value={formData.weight}
                                        onChange={(e) => handleChange('weight', e.target.value)}
                                        placeholder="70"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="injuryHistory">Histórico de Lesões</Label>
                                <Textarea
                                    id="injuryHistory"
                                    value={formData.injuryHistory}
                                    onChange={(e) => handleChange('injuryHistory', e.target.value)}
                                    placeholder="Descreva lesões anteriores, se houver"
                                    rows={3}
                                />
                            </div>

                            <div>
                                <Label htmlFor="currentInjuries">Lesões Atuais</Label>
                                <Textarea
                                    id="currentInjuries"
                                    value={formData.currentInjuries}
                                    onChange={(e) => handleChange('currentInjuries', e.target.value)}
                                    placeholder="Descreva lesões atuais ou deixe em branco"
                                    rows={3}
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 3: Saúde e Restrições Médicas */}
                    {currentStep === 3 && (
                        <div className="space-y-6">
                            <div className="border border-red-100 bg-red-50 p-4 rounded-lg">
                                <h4 className="font-semibold text-red-800 mb-2">⚠ Termo de Responsabilidade do Treinador</h4>
                                <p className="text-sm text-red-700 mb-4">
                                    Ao gerar treinos controlados por IA, é fundamental transcrever o estado de saúde clínico do seu aluno. Omissoes podem gerar exercícios agressivos inadequados. <b>O Treinador assume a responsabilidade pela veracidade das informações preenchidas nesta etapa.</b>
                                </p>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="acceptedTerms"
                                        checked={formData.acceptedTerms}
                                        onCheckedChange={(checked) => handleChange('acceptedTerms', checked)}
                                    />
                                    <label htmlFor="acceptedTerms" className="text-sm font-medium leading-none text-red-900 cursor-pointer">
                                        Declaro que as informações abaixo correspondem à realidade do Aluno.
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b pb-4">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Problemas de Saúde</Label>
                                        <p className="text-sm text-gray-500">O aluno possui alguma doença crônica, cardíaca ou sistêmica?</p>
                                    </div>
                                    <Checkbox
                                        checked={formData.hasHealthIssues}
                                        onCheckedChange={(checked) => handleChange('hasHealthIssues', checked)}
                                        className="w-6 h-6 rounded-full"
                                    />
                                </div>
                                {formData.hasHealthIssues && (
                                    <div>
                                        <Label htmlFor="healthIssuesDesc">Descreva os problemas de saúde *</Label>
                                        <Textarea
                                            id="healthIssuesDesc"
                                            value={formData.healthIssuesDesc}
                                            onChange={(e) => handleChange('healthIssuesDesc', e.target.value)}
                                            placeholder="Ex: Arritmia leve..."
                                            rows={2}
                                            className="border-red-300 focus-visible:ring-red-500"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b pb-4">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Uso de Medicamentos</Label>
                                        <p className="text-sm text-gray-500">Faz uso contínuo de medicação controlada?</p>
                                    </div>
                                    <Checkbox
                                        checked={formData.takesMedication}
                                        onCheckedChange={(checked) => handleChange('takesMedication', checked)}
                                        className="w-6 h-6 rounded-full"
                                    />
                                </div>
                                {formData.takesMedication && (
                                    <div>
                                        <Label htmlFor="medicationDesc">Quais medicamentos o aluno utiliza? *</Label>
                                        <Textarea
                                            id="medicationDesc"
                                            value={formData.medicationDesc}
                                            onChange={(e) => handleChange('medicationDesc', e.target.value)}
                                            placeholder="Ex: Losartana 50mg diário..."
                                            rows={2}
                                            className="border-red-300 focus-visible:ring-red-500"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Esportes */}
                    {currentStep === 4 && (
                        <div className="space-y-6">
                            {formData.sports.map((sportItem, index) => (
                                <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-4 relative bg-gray-50/50">
                                    <div className="flex justify-between items-center mb-2 border-b pb-2">
                                        <h4 className="font-semibold text-gray-700">Esporte {index + 1}</h4>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-600 h-8 px-2 hover:bg-red-50 hover:text-red-700"
                                            onClick={() => handleRemoveSport(index)}
                                        >
                                            Remover
                                        </Button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label>Esporte *</Label>
                                            <Select value={sportItem.sportId} onValueChange={(value) => handleSportChange(index, 'sportId', value)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione um esporte" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableSports.map(s => (
                                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div>
                                            {(() => {
                                                const sportPositions = availableSports.find(s => s.id === sportItem.sportId)?.positions || []
                                                return sportPositions.length > 0 ? (
                                                    <>
                                                        <Label>Posição *</Label>
                                                        <Select value={sportItem.position} onValueChange={(value) => handleSportChange(index, 'position', value)} disabled={!sportItem.sportId}>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Selecione a posição" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {sportPositions.map(pos => (
                                                                    <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Label>Posição <span className="text-gray-400 font-normal text-xs">(opcional)</span></Label>
                                                        <Input
                                                            value={sportItem.position}
                                                            onChange={(e) => handleSportChange(index, 'position', e.target.value)}
                                                            placeholder="Ex: Intermediário, Competitivo... (opcional)"
                                                            disabled={!sportItem.sportId}
                                                        />
                                                    </>
                                                )
                                            })()}
                                        </div>

                                        <div>
                                            <Label>Nível Técnico *</Label>
                                            <Select value={sportItem.technicalLevel} onValueChange={(value) => handleSportChange(index, 'technicalLevel', value)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione o nível" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {TECHNICAL_LEVELS.map(level => (
                                                        <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div>
                                            <Label>Pé/Mão Dominante *</Label>
                                            <Select value={sportItem.dominantFoot} onValueChange={(value) => handleSportChange(index, 'dominantFoot', value)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="direito">Direito / Destro</SelectItem>
                                                    <SelectItem value="esquerdo">Esquerdo / Canhoto</SelectItem>
                                                    <SelectItem value="ambidestro">Ambidestro</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div>
                                            <Label>Anos Praticando *</Label>
                                            <Input
                                                type="number"
                                                value={sportItem.yearsPlaying}
                                                onChange={(e) => handleSportChange(index, 'yearsPlaying', e.target.value)}
                                                placeholder="Ex: 10"
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <Label>Times Atuais</Label>
                                        <TeamAutocomplete
                                            selectedTeams={sportItem.teams}
                                            onChange={(val) => handleSportChange(index, 'teams', val)}
                                        />
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-purple-100 space-y-4">
                                        <h4 className="text-sm font-semibold text-purple-700 uppercase tracking-wide">Objetivos de Treino</h4>
                                        <div>
                                            <Label>Objetivo Específico *</Label>
                                            <Textarea
                                                value={sportItem.goals || ''}
                                                onChange={(e) => handleSportChange(index, 'goals', e.target.value)}
                                                placeholder="Descreva os objetivos que o treinador quer focar para este esporte"
                                                rows={2}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label>Dias por Semana *</Label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    max="7"
                                                    value={sportItem.trainingDaysPerWeek || ''}
                                                    onChange={(e) => handleSportChange(index, 'trainingDaysPerWeek', e.target.value)}
                                                    placeholder="Ex: 5"
                                                />
                                            </div>
                                            <div>
                                                <Label>Horas por Dia *</Label>
                                                <Input
                                                    type="number"
                                                    step="0.5"
                                                    min="0.5"
                                                    max="8"
                                                    value={sportItem.trainingHoursPerDay || ''}
                                                    onChange={(e) => handleSportChange(index, 'trainingHoursPerDay', e.target.value)}
                                                    placeholder="Ex: 2"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <Label>Focos de Treinamento *</Label>
                                            <div className="grid grid-cols-2 gap-3 mt-2">
                                                {TRAINING_FOCUS.map(focus => (
                                                    <div key={focus.value} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`focus-${index}-${focus.value}`}
                                                            checked={(sportItem.trainingFocus || []).includes(focus.value)}
                                                            onCheckedChange={() => handleSportTrainingFocusToggle(index, focus.value)}
                                                        />
                                                        <label
                                                            htmlFor={`focus-${index}-${focus.value}`}
                                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                        >
                                                            {focus.label}
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <Button
                                type="button"
                                variant="outline"
                                className="w-full border-dashed transition-all hover:border-purple-600 hover:text-purple-600"
                                onClick={handleAddSport}
                            >
                                + Adicionar Esporte
                            </Button>

                            <div className="pt-4 border-t">
                                <div>
                                    <Label htmlFor="strengths">Pontos Fortes (Geral)</Label>
                                    <Textarea
                                        id="strengths"
                                        value={formData.strengths}
                                        onChange={(e) => handleChange('strengths', e.target.value)}
                                        placeholder="Ex: Velocidade, desarme, passe longo"
                                        rows={3}
                                    />
                                </div>

                                <div className="mt-4">
                                    <Label htmlFor="weaknesses">Pontos a Melhorar (Geral)</Label>
                                    <Textarea
                                        id="weaknesses"
                                        value={formData.weaknesses}
                                        onChange={(e) => handleChange('weaknesses', e.target.value)}
                                        placeholder="Ex: Finalização, condicionamento físico"
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Navigation */}
                    <div className="flex justify-between mt-8">
                        <Button
                            variant="outline"
                            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                            disabled={currentStep === 1}
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Anterior
                        </Button>

                        {currentStep < STEPS.length ? (
                            <Button
                                onClick={handleNext}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                Próximo
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleFinalSubmit}
                                disabled={loading}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                {loading ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                                ) : (
                                    <>Concluir <Check className="ml-2 h-4 w-4" /></>
                                )}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div >
    )
}
