'use client'

import { ROLES } from '@/lib/constants'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Loader2, Edit2, User, Activity, Target, Trophy, Footprints, Globe, Lock, Save, Shield, Flame, CheckCircle2, ChevronRight, Plus } from 'lucide-react'
import { toast } from 'sonner'

function InfoRow({ label, value }) {
    if (!value && value !== 0) return null
    return (
        <div className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-600 flex-shrink-0 mr-4">{label}</span>
            <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
        </div>
    )
}

export default function ProfilePage() {
    const { data: session, update: updateSession } = useSession()
    const router = useRouter()
    // A chave do namespace era 'ProfilePage' em arquivos de idioma
    const t = useTranslations('ProfilePage')
    const [athleteProfiles, setAthleteProfiles] = useState([])
    const [userProfile, setUserProfile] = useState(null)
    const [loading, setLoading] = useState(true)
    const [isSavingUser, setIsSavingUser] = useState(false)
    const [isSocialModalOpen, setIsSocialModalOpen] = useState(false)
    const [mySubscriptions, setMySubscriptions] = useState([])
    const [myTrainers, setMyTrainers] = useState([])

    // Form inputs for Social Profile
    const [socialForm, setSocialForm] = useState({
        name: '',
        username: '',
        bio: '',
        isPublic: false,
        role: '',
        phone: ''
    })

    const FOCUS_LABELS = {
        fisico: t('focusFisico'),
        tecnico: t('focusTecnico'),
        tatico: t('focusTatico'),
        recuperacao: t('focusRecuperacao'),
    }

    const POSITION_LABELS = {
        goleiro: t('posGoleiro'),
        zagueiro: t('posZagueiro'),
        'lateral-direito': t('posLateralDireito'),
        'lateral-esquerdo': t('posLateralEsquerdo'),
        volante: t('posVolante'),
        meia: t('posMeia'),
        ponta: t('posPonta'),
        atacante: t('posAtacante'),
        fixo: t('posFixo'),
        'ala-direita': t('posAlaDireita'),
        'ala-esquerda': t('posAlaEsquerda'),
        pivo: t('posPivo'),
        levantador: t('posLevantador'),
        libero: t('posLibero'),
        oposto: t('posOposto'),
        central: t('posCentral'),
        ponteiro: t('posPonteiro'),
    }

    // Removed hardcoded SPORT_LABELS as it's now dynamically fetched from DB

    const LEVEL_LABELS = {
        iniciante: t('lvlIniciante'),
        intermediario: t('lvlIntermediario'),
        avancado: t('lvlAvancado'),
        profissional: t('lvlProfissional'),
    }

    useEffect(() => {
        fetchAllData()

        // Auto-open Edit Modal for Onboarding redirects
        if (typeof window !== 'undefined' && window.location.hash === '#edit') {
            setIsSocialModalOpen(true)
        }
    }, [])

    const fetchAllData = async () => {
        try {
            const resAthlete = await fetch('/api/backend/profile')
            if (resAthlete.ok) {
                const dataAthlete = await resAthlete.json()
                setAthleteProfiles(dataAthlete.profiles || [])
            }
            // Fetch Social User Data
            const resUser = await fetch('/api/backend/user/profile')
            if (resUser.ok) {
                const dataUser = await resUser.json()
                setUserProfile(dataUser)
                setSocialForm({
                    name: dataUser.name || '',
                    username: dataUser.username || '',
                    bio: dataUser.bio || '',
                    isPublic: dataUser.isPublic || false,
                    role: dataUser.roles?.[0] || '',
                    phone: dataUser.phone || ''
                })
            }
            // Fetch Subscriptions & Trainers
            const resSubs = await fetch('/api/backend/user/subscriptions')
            if (resSubs.ok) {
                const dataSubs = await resSubs.json()
                setMySubscriptions(dataSubs.subscriptions || [])
                setMyTrainers(dataSubs.trainers || [])
            }
        } catch (error) {
            console.error('Error fetching profile data:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSocialSubmit = async (e) => {
        if (e) e.preventDefault()
        setIsSavingUser(true)

        try {
            const response = await fetch('/api/backend/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(socialForm)
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(errorText || 'Erro ao atualizar perfil')
            }

            toast.success('Perfil atualizado com sucesso!')

            // If role changed, update next-auth session
            if (socialForm.role && !session?.user?.roles?.includes(socialForm.role)) {
                await updateSession()
                window.location.reload()
            } else {
                // Fechar o modal simulando um reload suave de dados
                setIsSocialModalOpen(false)
                fetchAllData()
            }
        } catch (error) {
            toast.error(error.message)
        } finally {
            setIsSavingUser(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        )
    }

    const handleDisconnect = async (id, isSub = false) => {
        if (!confirm('Você tem certeza que deseja cancelar e se desconectar deste treinador? Essa ação não pode ser desfeita e você deixará de receber planos dessa conta.')) return

        setLoading(true)
        try {
            const endpointId = isSub ? id : id
            const response = await fetch(`/api/backend/user/subscriptions/${endpointId}`, { method: 'DELETE' })
            if (response.ok) {
                toast.success('Desconectado com sucesso!')
                fetchAllData()
            } else {
                toast.error('Ocorreu um erro ao desconectar.')
            }
        } catch (error) {
            toast.error('Erro de conexão com o servidor.')
        } finally {
            setLoading(false)
        }
    }

    const renderAthleteSheet = () => {
        if (!athleteProfiles || athleteProfiles.length === 0) {
            return (
                <div className="max-w-2xl mx-auto py-8 text-center space-y-4">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                        <User className="w-10 h-10 text-gray-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">{t('titleUnfilled')}</h1>
                    <p className="text-gray-600">{t('descUnfilled')}</p>
                    <Button className="bg-green-600 hover:bg-green-700" onClick={() => router.push('/dashboard/profile/edit')}>
                        <Edit2 className="mr-2 h-4 w-4" />
                        {t('btnFillProfile')}
                    </Button>
                </div>
            )
        }

        const globalData = athleteProfiles[0]

        return (
            <div className="space-y-8">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-bold text-gray-800">Ficha Médica e Esportiva</h2>
                    <Button variant="outline" onClick={() => router.push('/dashboard/profile/edit')}>
                        <Plus className="mr-2 h-4 w-4" />
                        NOVO ESPORTE
                    </Button>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Activity className="w-4 h-4 text-green-600" />
                                {t('titlePhysicalData') || 'Dados Físicos e Clínicos'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <InfoRow label={t('labelAge') || 'Idade'} value={globalData.age ? t('valAge', { age: globalData.age }) || `${globalData.age} anos` : null} />
                            <InfoRow label={t('labelHeight') || 'Altura'} value={globalData.height ? t('valHeight', { height: globalData.height }) || `${globalData.height} cm` : null} />
                            <InfoRow label={t('labelWeight') || 'Peso'} value={globalData.weight ? t('valWeight', { weight: globalData.weight }) || `${globalData.weight} kg` : null} />
                            {globalData.injuryHistory && (
                                <div className="py-2 border-b border-gray-100">
                                    <p className="text-sm text-gray-600 mb-1">{t('labelInjuryHistory') || 'Histórico de Lesões'}</p>
                                    <p className="text-sm text-gray-900 bg-gray-50 rounded p-2">{globalData.injuryHistory}</p>
                                </div>
                            )}
                            {globalData.currentInjuries && !['nenhuma', 'nenhum', 'nao', 'não', 'none', '-', '.'].includes(globalData.currentInjuries.trim().toLowerCase()) && (
                                <div className="py-2">
                                    <p className="text-sm text-gray-600 mb-1">{t('labelCurrentInjuries') || 'Lesões Atuais'}</p>
                                    <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">{globalData.currentInjuries}</p>
                                </div>
                            )}
                            {!globalData.height && !globalData.weight && !globalData.injuryHistory && !globalData.currentInjuries && (
                                <p className="text-sm text-gray-500 italic py-2">{t('emptyPhysicalData') || 'Nenhum dado físico preenchido'}</p>
                            )}
                        </CardContent>
                    </Card>


                </div>

                {(globalData.strengths || globalData.weaknesses) && (
                    <div className="grid md:grid-cols-2 gap-4">
                        {globalData.strengths && (
                            <Card className="border-green-100 bg-green-50/30">
                                <CardHeader className="py-3">
                                    <CardTitle className="flex items-center gap-2 text-base text-green-700">
                                        <Trophy className="w-4 h-4" />{t('titleStrengths') || 'Pontos Fortes Gerais'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent><p className="text-sm text-gray-700">{globalData.strengths}</p></CardContent>
                            </Card>
                        )}
                        {globalData.weaknesses && (
                            <Card className="border-orange-100 bg-orange-50/30">
                                <CardHeader className="py-3">
                                    <CardTitle className="flex items-center gap-2 text-base text-orange-700">
                                        <Footprints className="w-4 h-4" />{t('titleWeaknesses') || 'Pontos a Melhorar (Gerais)'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent><p className="text-sm text-gray-700">{globalData.weaknesses}</p></CardContent>
                            </Card>
                        )}
                    </div>
                )}

                <h3 className="text-lg font-bold text-gray-800 mt-8 mb-4 border-b pb-2">Suas Modalidades</h3>

                <div className="grid md:grid-cols-2 gap-6">
                    {athleteProfiles.map((athleteProfile, idx) => (
                        <Card key={athleteProfile.id} className="relative border-gray-200 hover:border-green-300 transition-colors shadow-sm">
                            <CardHeader className="pb-2 bg-gray-50/50 border-b">
                                <div className="flex justify-between items-center">
                                    <CardTitle className="flex items-center gap-2 text-lg text-green-700 capitalize">
                                        <User className="w-5 h-5" />
                                        {athleteProfile.sport?.name || 'Desconhecido'}
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" className="text-gray-500" onClick={() => router.push(`/dashboard/profile/edit?sportId=${athleteProfile.sportId}`)}>
                                        <Edit2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-4">
                                <InfoRow label={t('labelPosition') || 'Posição Principal'} value={POSITION_LABELS[athleteProfile.position] || athleteProfile.position} />
                                <InfoRow label={t('labelLevel') || 'Nível'} value={LEVEL_LABELS[athleteProfile.technicalLevel] || athleteProfile.technicalLevel} />
                                <InfoRow label={t('labelDominantFoot') || 'Pé/Mão Dominante'} value={
                                    athleteProfile.dominantFoot === 'direito' ? t('valRight') || 'Direito' :
                                        athleteProfile.dominantFoot === 'esquerdo' ? t('valLeft') || 'Esquerdo' :
                                            athleteProfile.dominantFoot === 'ambidestro' ? t('valAmbidextrous') || 'Ambidestro' : null
                                } />
                                <InfoRow label={t('labelYearsPlaying') || 'Tempo de Prática'} value={athleteProfile.yearsPlaying ? t('valYearsPlaying', { years: athleteProfile.yearsPlaying }) || `${athleteProfile.yearsPlaying} anos` : null} />
                                <InfoRow label={t('labelCurrentTeam') || 'Times Atuais'} value={athleteProfile.teams?.length > 0 ? athleteProfile.teams.map(t => t.name).join(', ') : 'Nenhum'} />

                                <div className="mt-6 pt-4 border-t border-gray-100">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Target className="w-4 h-4 text-green-600" />
                                        <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wider">{t('titleGoals') || 'Objetivos de Treino'}</h4>
                                    </div>

                                    {athleteProfile.goals && (
                                        <div className="py-2 mb-2">
                                            <p className="text-sm text-gray-600 mb-1">{t('labelGoals') || 'Objetivo Específico'}</p>
                                            <p className="text-sm text-gray-900 bg-gray-50 rounded p-2 italic">"{athleteProfile.goals}"</p>
                                        </div>
                                    )}
                                    <InfoRow label={t('labelDaysPerWeek') || 'Dias Disponíveis'} value={athleteProfile.trainingDaysPerWeek ? t('valDays', { days: athleteProfile.trainingDaysPerWeek }) || `${athleteProfile.trainingDaysPerWeek}x na semana` : null} />
                                    <InfoRow label={t('labelHoursPerDay') || 'Horas Disponíveis'} value={athleteProfile.trainingHoursPerDay ? t('valHours', { hours: athleteProfile.trainingHoursPerDay }) || `${athleteProfile.trainingHoursPerDay}h por dia` : null} />

                                    {athleteProfile.trainingFocus && athleteProfile.trainingFocus.length > 0 && (
                                        <div className="py-3">
                                            <p className="text-sm text-gray-600 mb-2">{t('labelTrainingFocus') || 'Focos de Treino'}</p>
                                            <div className="flex flex-wrap gap-2">
                                                {athleteProfile.trainingFocus.map(f => (
                                                    <Badge key={f} className="bg-green-100 text-green-800" variant="outline">{FOCUS_LABELS[f] || f}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-8">
            {/* Gamification Profile Header */}
            <Card className="mb-6 overflow-hidden border-t-4 border-t-green-600 shadow-sm relative">
                <div className="h-24 bg-gradient-to-r from-gray-100 to-gray-200 w-full relative"></div>

                <CardContent className="pt-0 relative px-6 sm:px-8">
                    <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start -mt-12">
                        <img
                            src={session?.user?.image || '/default-avatar.png'}
                            alt={session?.user?.name || 'User Avatar'}
                            className="w-24 h-24 rounded-full border-4 border-white shadow-md bg-white object-cover"
                            onError={(e) => { e.target.style.display = 'none' }}
                        />

                        <div className="flex-1 text-center sm:text-left pt-14 sm:pt-16 sm:mt-0 flex flex-col justify-center">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 leading-tight">{session?.user?.name}</h1>
                                {userProfile?.username && (
                                    <p className="text-green-600 font-medium mt-1">@{userProfile.username}</p>
                                )}
                            </div>
                        </div>

                        {/* Gamification Stats */}
                        {userProfile?.stats && (
                            <div className="w-full sm:w-auto flex flex-wrap justify-center sm:justify-end gap-x-8 gap-y-4 pt-4 sm:pt-16 pb-4 sm:pb-0 border-t sm:border-t-0 border-gray-100 mt-4 sm:mt-0">
                                <div className="text-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl font-bold text-gray-900 leading-none">{userProfile.stats.followers || 0}</span>
                                        <span className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold mt-1">Seguidores</span>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl font-bold text-gray-900 leading-none">{userProfile.stats.following || 0}</span>
                                        <span className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold mt-1">Seguindo</span>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="flex flex-col items-center text-orange-500">
                                        <div className="flex items-center gap-1.5 h-8">
                                            <Flame className="w-5 h-5" />
                                            <span className="text-2xl font-bold leading-none">{userProfile.stats.streak || 0}</span>
                                        </div>
                                        <span className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold mt-1">Ofensiva (Dias)</span>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="flex flex-col items-center text-green-600">
                                        <div className="flex items-center gap-1.5 h-8">
                                            <CheckCircle2 className="w-5 h-5" />
                                            <span className="text-2xl font-bold leading-none">{userProfile.stats.completionRate || 0}%</span>
                                        </div>
                                        <span className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold mt-1">Taxa de Conclusão</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Edit Profile Button Floating on Header (Desktop) */}
                        <div className="absolute top-4 right-4 hidden sm:block">
                            <Dialog open={isSocialModalOpen} onOpenChange={setIsSocialModalOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="bg-white/80 backdrop-blur-sm hover:bg-white text-gray-800 border-gray-200">
                                        <Edit2 className="w-4 h-4 mr-2" /> Editar Perfil
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle>Editar Perfil Social</DialogTitle>
                                        <DialogDescription>Personalize como você aparece na plataforma.</DialogDescription>
                                    </DialogHeader>
                                    {/* ----- SOCIAL FORM MOVIDO PARA O MODAL ----- */}
                                    <form onSubmit={handleSocialSubmit} className="space-y-6 mt-4">
                                        <div className="space-y-4">
                                            <div>
                                                <Label htmlFor="role">Tipo de Usuário (Cargo)</Label>
                                                <RadioGroup
                                                    value={socialForm.role}
                                                    onValueChange={(val) => setSocialForm(prev => ({ ...prev, role: val }))}
                                                    className="flex flex-col gap-3 mt-2"
                                                >
                                                    <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-md border">
                                                        <RadioGroupItem value={ROLES.INDIVIDUAL} id="r-athlete" />
                                                        <Label htmlFor="r-athlete" className="cursor-pointer flex-1">
                                                            <span className="font-semibold block mb-0.5">Sou Atleta</span>
                                                            <span className="text-sm text-gray-500 font-normal">Quero receber treinos e evoluir.</span>
                                                        </Label>
                                                    </div>
                                                    <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-md border">
                                                        <RadioGroupItem value={ROLES.PROFESSIONAL} id="r-trainer" />
                                                        <Label htmlFor="r-trainer" className="cursor-pointer flex-1">
                                                            <span className="font-semibold block mb-0.5">Sou Treinador</span>
                                                            <span className="text-sm text-gray-500 font-normal">Quero gerenciar atletas e treinos.</span>
                                                        </Label>
                                                    </div>

                                                </RadioGroup>
                                            </div>

                                            <div>
                                                <Label htmlFor="name">Nome Completo</Label>
                                                <Input id="name" value={socialForm.name} onChange={(e) => setSocialForm({ ...socialForm, name: e.target.value })} />
                                            </div>
                                            <div>
                                                <Label htmlFor="userName">Nome de Usuário (@arroba)</Label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-2.5 text-gray-500 font-bold">@</span>
                                                    <Input
                                                        id="userName"
                                                        className="pl-8"
                                                        placeholder="seunome99"
                                                        value={socialForm.username}
                                                        onChange={(e) => setSocialForm({ ...socialForm, username: e.target.value.toLowerCase().trim() })}
                                                        maxLength={20}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <Label htmlFor="bio">Biografia</Label>
                                                <Textarea
                                                    id="bio"
                                                    placeholder="Conte sobre sua trajetória no futebol..."
                                                    rows={3}
                                                    value={socialForm.bio}
                                                    onChange={(e) => setSocialForm({ ...socialForm, bio: e.target.value })}
                                                />
                                            </div>

                                            <div>
                                                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                                                <Input
                                                    id="phone"
                                                    type="tel"
                                                    placeholder="(11) 99999-9999"
                                                    value={socialForm.phone}
                                                    onChange={(e) => setSocialForm({ ...socialForm, phone: e.target.value })}
                                                    maxLength={16}
                                                />
                                                <p className="text-xs text-gray-400 mt-1">Usado internamente pela equipe Play Action. Não será exibido publicamente.</p>
                                            </div>

                                            <div className="p-4 border rounded-lg bg-slate-50 flex items-start justify-between gap-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        {socialForm.isPublic ? <Globe className="w-4 h-4 text-green-600" /> : <Lock className="w-4 h-4 text-gray-500" />}
                                                        <Label htmlFor="public-profile" className="text-base font-semibold cursor-pointer">
                                                            Conta Pública (Rede Social)
                                                        </Label>
                                                    </div>
                                                    <p className="text-sm text-gray-600">
                                                        Permitir que seu perfil (@{socialForm.username || 'arroba'}) seja visto por outras pessoas na gamificação.
                                                    </p>
                                                </div>
                                                <Switch
                                                    id="public-profile"
                                                    checked={socialForm.isPublic}
                                                    onCheckedChange={(val) => setSocialForm({ ...socialForm, isPublic: val })}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-4 border-t">
                                            <Button type="button" variant="outline" onClick={() => setIsSocialModalOpen(false)} className="mr-2">Cancelar</Button>
                                            <Button type="submit" disabled={isSavingUser} className="bg-green-600 hover:bg-green-700">
                                                {isSavingUser ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                                Salvar Perfil
                                            </Button>
                                        </div>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                    {/* Mobile Edit Button */}
                    <div className="sm:hidden mt-6 flex justify-center">
                        <Button variant="outline" className="w-full" onClick={() => setIsSocialModalOpen(true)}>
                            <Edit2 className="w-4 h-4 mr-2" /> Editar Perfil
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="social" className="w-full">
                <TabsList className="flex w-full overflow-x-auto mb-6 h-auto p-1 gap-1">
                    <TabsTrigger value="social" className="flex-1 min-w-fit text-xs sm:text-sm font-medium whitespace-nowrap px-3 py-2"><span className="sm:hidden">Conta</span><span className="hidden sm:inline">Perfil &amp; Social</span></TabsTrigger>
                    {/* Usa socialForm (DB) OU sessão como fallback — evita flash de abas de atleta para treinadores */}
                    {(socialForm.role || session?.user?.roles?.[0]) !== ROLES.PROFESSIONAL && (
                        <>
                            <TabsTrigger value="athlete" className="flex-1 min-w-fit text-xs sm:text-sm font-medium whitespace-nowrap px-3 py-2"><span className="sm:hidden">Ficha</span><span className="hidden sm:inline">Ficha Médica Atlética</span></TabsTrigger>
                            <TabsTrigger value="subscriptions" className="flex-1 min-w-fit text-xs sm:text-sm font-medium whitespace-nowrap px-3 py-2"><span className="sm:hidden">Treinadores</span><span className="hidden sm:inline">Meus Treinadores</span></TabsTrigger>
                        </>
                    )}
                </TabsList>

                {/* ---------- TAB: PERFIL SOCIAL ---------- */}
                <TabsContent value="social">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Resumo da Conta</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Biografia</h3>
                                {userProfile?.bio ? (
                                    <p className="text-gray-800 whitespace-pre-wrap">{userProfile.bio}</p>
                                ) : (
                                    <p className="text-gray-400 italic">Nenhuma biografia informada. Adicione informações no botão "Editar Perfil".</p>
                                )}
                            </div>

                            <div>
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Visibilidade e Cargo</h3>
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                            {userProfile?.isPublic ? <Globe className="w-4 h-4 text-green-600" /> : <Lock className="w-4 h-4 text-gray-500" />}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{userProfile?.isPublic ? 'Perfil Público' : 'Perfil Privado'}</p>
                                            <p className="text-sm text-gray-500">
                                                {userProfile?.isPublic ? 'Sua conta pode ser encontrada por outros jogadores.' : 'Sua conta está invisível para outros jogadores.'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                            <Shield className="w-4 h-4 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">
                                                {(userProfile?.roles?.includes(ROLES.PROFESSIONAL) && userProfile?.roles?.includes(ROLES.INDIVIDUAL)) ? 'Treinador & Atleta' : userProfile?.roles?.includes(ROLES.PROFESSIONAL) ? 'Treinador' : userProfile?.roles?.includes(ROLES.CLIENT) ? 'Aluno(a)' : 'Atleta Independente'}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                Este é o seu acesso principal na plataforma.
                                            </p>
                                        </div>
                                    </div>
                                    {userProfile?.phone && (
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                                <span>📱</span>
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">{userProfile.phone}</p>
                                                <p className="text-sm text-gray-500">Telefone / WhatsApp (privado)</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ---------- TAB: FICHA ATLÉTICA ---------- */}
                {(socialForm.role || session?.user?.roles?.[0]) !== ROLES.PROFESSIONAL && (
                    <>
                        <TabsContent value="athlete">
                            {renderAthleteSheet()}
                        </TabsContent>

                        {/* ---------- TAB: MEUS TREINADORES ---------- */}
                        <TabsContent value="subscriptions">
                            <div className="space-y-6">
                                <h2 className="text-lg font-bold text-gray-800 border-b pb-2">
                                    Conexões e Assinaturas
                                </h2>

                                {/* Render Trainers by free links */}
                                {myTrainers.length > 0 ? myTrainers.map(studentLink => {
                                    // if there is a subscription mapping to this trainer, find it to display "Cancel Sub".
                                    const matchingSub = mySubscriptions.find(s => s.offer?.partner?.userId === studentLink.trainer?.id)

                                    return (
                                        <Card key={studentLink.id} className="border-gray-200 shadow-sm relative overflow-hidden">
                                            <CardHeader className="flex flex-row items-center justify-between pb-4 bg-gray-50 border-b relative z-10">
                                                <div className="flex items-center gap-4">
                                                    <img
                                                        src={studentLink.trainer?.image || '/default-avatar.png'}
                                                        alt={studentLink.trainer?.name}
                                                        className="w-12 h-12 rounded-full border shadow-sm object-cover bg-white"
                                                    />
                                                    <div>
                                                        <CardTitle className="text-base text-gray-900">{studentLink.trainer?.name}</CardTitle>
                                                        <CardDescription>{matchingSub ? 'Plano B2B Ativo (Recorrente)' : 'Conectado via Convite Local'}</CardDescription>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => handleDisconnect(matchingSub ? matchingSub.id : studentLink.id, !!matchingSub)}
                                                >
                                                    {matchingSub ? 'Cancelar & Desconectar' : 'Desconectar Treinador'}
                                                </Button>
                                            </CardHeader>
                                            <CardContent className="pt-4">
                                                {matchingSub && (
                                                    <div className="mb-4">
                                                        <p className="text-sm font-semibold text-gray-800">Plano Assinado: <span className="text-green-600">{matchingSub.offer?.name}</span></p>
                                                        <p className="text-xs text-gray-500 mt-1">Status na Stripe: {matchingSub.status === 'active' ? 'Ativo' : matchingSub.status}</p>
                                                        <p className="text-xs text-gray-400 mt-1 italic">Sua vaga cancela no final do ciclo de faturamento para evitar cobrança extra.</p>
                                                    </div>
                                                )}

                                                <div className="border-t border-gray-100 pt-3">
                                                    <p className="text-sm text-gray-600 mb-2">Esportes conectando vocês:</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {studentLink.athleteProfiles?.map(ap => (
                                                            <Badge key={ap.id} variant="secondary" className="bg-slate-100 text-slate-700 capitalize">
                                                                {ap.sport?.name}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )
                                }) : (
                                    <div className="py-12 bg-gray-50/50 rounded-xl border border-dashed border-gray-200 text-center px-4">
                                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center border shadow-sm mx-auto mb-4">
                                            <User className="h-8 w-8 text-gray-300" />
                                        </div>
                                        <h3 className="font-semibold text-gray-800">Você não possui treinadores</h3>
                                        <p className="text-sm text-gray-500 max-w-sm mx-auto mt-2">
                                            Quando você aceitar o convite de um treinador ou pagar por um plano B2B, a assinatura aparecerá aqui para ser gerenciada.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </TabsContent>
                    </>
                )}
            </Tabs>
        </div>
    )
}

