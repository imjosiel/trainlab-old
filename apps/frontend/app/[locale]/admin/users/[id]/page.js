'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    ArrowLeft, Loader2, Mail, Calendar, Trophy,
    Dumbbell, Users, CreditCard, ExternalLink,
    TrendingUp, CheckCircle2, Zap, MessageSquare, Briefcase, Gift, XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function UserReportPage() {
    const { id } = useParams()
    const router = useRouter()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [b2bData, setB2bData] = useState({ offers: [], subscriptions: [] })
    const [grantOfferId, setGrantOfferId] = useState('')
    const [granting, setGranting] = useState(false)

    useEffect(() => {
        fetchReport()
        fetchB2BData()
    }, [id])

    const fetchB2BData = async () => {
        try {
            const res = await fetch(`/api/backend/admin/users/${id}/subscription`)
            if (res.ok) setB2bData(await res.json())
        } catch {}
    }

    const fetchReport = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/backend/admin/users/${id}/report`)
            if (!res.ok) throw new Error('Falha ao carregar relatório')
            const json = await res.json()
            setData(json)
        } catch (err) {
            toast.error(err.message)
            router.push('/admin/users')
        } finally {
            setLoading(false)
        }
    }

    const handleGrantSub = async (action, extraId) => {
        setGranting(true)
        try {
            const body = action === 'grant'
                ? { action, offerId: grantOfferId }
                : { action: 'revoke', subscriptionId: extraId }
            const res = await fetch(`/api/backend/admin/users/${id}/subscription`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(action === 'grant' ? 'Assinatura B2B concedida!' : 'Assinatura cancelada!')
            fetchReport()
            fetchB2BData()
        } catch (err) {
            toast.error(err.message)
        } finally {
            setGranting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        )
    }

    const { user, athleteStats, coachStats, partnerStats } = data

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            {/* Header / Quick Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/admin/users')}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <Avatar className="h-14 w-14 border-2 border-green-100 shadow-sm">
                            <AvatarImage src={user.image} />
                            <AvatarFallback className="bg-green-50 text-green-700 text-lg font-bold">
                                {user.name?.[0] || '?'}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none">
                                    {user.systemRoles?.join(', ') || 'Nenhum System Role'}
                                </Badge>
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                    <Mail className="w-3 h-3" /> {user.email}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.open(`mailto:${user.email}`)}>
                        <Mail className="w-4 h-4 mr-2" />
                        Enviar Email
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="bg-gray-100 p-1 rounded-xl mb-6">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">Geral</TabsTrigger>
                    <TabsTrigger value="athlete" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">Atleta</TabsTrigger>
                    <TabsTrigger value="coach" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">Treinador</TabsTrigger>
                    {partnerStats && (
                        <TabsTrigger value="financial" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 text-green-700 font-medium">Financeiro</TabsTrigger>
                    )}
                </TabsList>

                {/* --- Tab: Overview --- */}
                <TabsContent value="overview" className="space-y-6 outline-none">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="border-green-100 bg-white/50 backdrop-blur-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                                    Status da Assinatura
                                    {user.subscriptionStatus === 'active' ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Loader2 className="w-4 h-4 text-orange-500" />}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold capitalize">{user.subscriptionStatus || 'Nenhum'}</div>
                                <p className="text-sm text-gray-500 mt-1">Plano: <span className="font-semibold text-gray-700">{user.subscriptionPlan || 'Free'}</span></p>
                            </CardContent>
                        </Card>

                        {/* Grant B2B Subscription Card */}
                        <Card className="border-purple-100 bg-purple-50/40 col-span-1 md:col-span-2">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold text-purple-700 flex items-center gap-2">
                                    <Gift className="w-4 h-4" /> Conceder Acesso B2B (Teste)
                                </CardTitle>
                                <CardDescription>Cria uma PartnerSubscription diretamente, sem Stripe, para testar o acesso do aluno</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Grant form */}
                                <div className="flex flex-wrap gap-3 items-end">
                                    <div className="space-y-1 flex-1 min-w-48">
                                        <p className="text-xs text-gray-500 font-medium">Oferta do Parceiro</p>
                                        <Select value={grantOfferId} onValueChange={setGrantOfferId}>
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Selecione uma oferta..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {b2bData.offers.length === 0 && (
                                                    <SelectItem value="none" disabled>Nenhuma oferta ativa cadastrada</SelectItem>
                                                )}
                                                {b2bData.offers.map(o => (
                                                    <SelectItem key={o.id} value={o.id}>
                                                        {o.partner?.user?.name} — {o.name} (R$ {o.price?.toFixed(2)})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button
                                        size="sm"
                                        className="bg-purple-600 hover:bg-purple-700 h-9"
                                        onClick={() => handleGrantSub('grant')}
                                        disabled={granting || !grantOfferId}
                                    >
                                        {granting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Gift className="w-4 h-4 mr-1" /> Conceder</>}
                                    </Button>
                                </div>

                                {/* Existing subscriptions */}
                                {b2bData.subscriptions.length > 0 && (
                                    <div className="border-t pt-3 space-y-2">
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assinaturas Atuais</p>
                                        {b2bData.subscriptions.map(sub => (
                                            <div key={sub.id} className="flex items-center justify-between p-2 bg-white border rounded-lg text-sm">
                                                <div>
                                                    <span className="font-medium">{sub.offer?.partner?.user?.name} — {sub.offer?.name}</span>
                                                    <Badge className={`ml-2 text-[10px] ${sub.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                        {sub.status}
                                                    </Badge>
                                                    {!sub.stripeSubscriptionId && (
                                                        <Badge className="ml-1 text-[10px] bg-purple-100 text-purple-700">teste manual</Badge>
                                                    )}
                                                </div>
                                                {sub.status === 'active' && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="border-red-200 text-red-600 hover:bg-red-50 h-7 text-xs"
                                                        onClick={() => handleGrantSub('revoke', sub.id)}
                                                        disabled={granting}
                                                    >
                                                        <XCircle className="w-3 h-3 mr-1" /> Cancelar
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="border-blue-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Membros desde</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{format(new Date(user.createdAt), 'dd MMMM, yyyy', { locale: ptBR })}</div>
                                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> Primeira ação registrada
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border-orange-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Papel Funcional</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {user.roles?.join(', ') || 'Nenhum Cargo'}
                                </div>
                                <p className="text-sm text-gray-500 mt-1">Contexto de permissão do usuário</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Perfis de Atleta</CardTitle>
                                <CardDescription>Esportes e posições cadastradas</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {user.athleteProfiles.length > 0 ? (
                                    <div className="space-y-4">
                                        {user.athleteProfiles.map(profile => (
                                            <div key={profile.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-green-100 p-2 rounded-lg">
                                                        <Trophy className="w-5 h-5 text-green-600" />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-sm">{profile.position || 'Geral'}</p>
                                                        <p className="text-xs text-gray-500 capitalize">{profile.technicalLevel || 'Iniciante'}</p>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="text-[10px] uppercase">{profile.dominantFoot || 'Destro'}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400 text-center py-4 italic">Nenhum perfil esportivo vinculado ainda.</p>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Social & Biografia</CardTitle>
                                <CardDescription>Dados públicos do perfil</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg italic">
                                    {user.bio || 'Sem biografia definida.'}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {user.socialLinks ? Object.entries(user.socialLinks).map(([key, val]) => (
                                        <Badge key={key} variant="secondary" className="cursor-pointer hover:bg-gray-200" onClick={() => window.open(val, '_blank')}>
                                            <ExternalLink className="w-3 h-3 mr-1" /> {key}
                                        </Badge>
                                    )) : <p className="text-xs text-gray-400">Nenhum link social cadastrado.</p>}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* --- Tab: Athlete Metrics --- */}
                <TabsContent value="athlete" className="space-y-6 outline-none">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <Card className="lg:col-span-1">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Aderência em Treinos</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-4">
                                <div className="flex flex-col items-center">
                                    <div className="text-4xl font-black text-green-600 mb-1">{athleteStats.sessionCompletionRate}%</div>
                                    <p className="text-xs text-gray-500">Taxa de Conclusão total</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-500">Sessões Total</span>
                                        <span className="font-bold">{athleteStats.totalSessions}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-500">Finalizadas</span>
                                        <span className="font-bold text-green-600">{athleteStats.completedSessions}</span>
                                    </div>
                                    <Progress value={athleteStats.sessionCompletionRate} className="h-1.5" />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="lg:col-span-1">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Detalhamento de Exercícios</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-4">
                                <div className="flex flex-col items-center">
                                    <div className="text-4xl font-black text-blue-600 mb-1">{athleteStats.exerciseCompletionRate}%</div>
                                    <p className="text-xs text-gray-500">Aderência Individual</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-500">Aulas Executadas</span>
                                        <span className="font-bold">{athleteStats.completedExercises}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-500">Aulas Sugeridas</span>
                                        <span className="font-bold">{athleteStats.totalExercises}</span>
                                    </div>
                                    <Progress value={athleteStats.exerciseCompletionRate} className="h-1.5 bg-blue-100" />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="lg:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-lg">Plano Atual</CardTitle>
                                <CardDescription>Resumo do plano de treinamento ativo</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {athleteStats.lastPlan ? (
                                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-start justify-between">
                                        <div>
                                            <h4 className="font-bold text-gray-900">{athleteStats.lastPlan.title}</h4>
                                            <div className="flex gap-4 mt-2">
                                                <div className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> Criado em {format(new Date(athleteStats.lastPlan.createdAt), 'dd/MM/yyyy')}</div>
                                                <div className="text-xs text-gray-500 flex items-center gap-1"><Badge variant="outline" className="text-[10px]">{athleteStats.lastPlan.status}</Badge></div>
                                            </div>
                                        </div>
                                        <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/plans/${athleteStats.lastPlan.id}`)}>
                                            Ver Plano
                                        </Button>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400 py-4 italic text-center">Nenhum plano ativo vinculado.</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* --- Tab: Coach Stats --- */}
                <TabsContent value="coach" className="space-y-6 outline-none">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="border-l-4 border-l-green-500">
                            <CardHeader className="pb-1">
                                <CardTitle className="text-4xl font-black">{coachStats.studentsManaged}</CardTitle>
                                <CardDescription className="text-sm font-medium text-gray-500 uppercase flex items-center gap-1 mt-1">
                                    <Users className="w-4 h-4" /> Alunos sob Gestão
                                </CardDescription>
                            </CardHeader>
                        </Card>
                        <Card className="border-l-4 border-l-blue-500">
                            <CardHeader className="pb-1">
                                <CardTitle className="text-4xl font-black">{coachStats.customExercises}</CardTitle>
                                <CardDescription className="text-sm font-medium text-gray-500 uppercase flex items-center gap-1 mt-1">
                                    <Dumbbell className="w-4 h-4" /> Exercícios Criados
                                </CardDescription>
                            </CardHeader>
                        </Card>
                        <Card className="border-l-4 border-l-orange-500">
                            <CardHeader className="pb-1">
                                <CardTitle className="text-4xl font-black">{coachStats.plansCreated}</CardTitle>
                                <CardDescription className="text-sm font-medium text-gray-500 uppercase flex items-center gap-1 mt-1">
                                    <Zap className="w-4 h-4" /> Planos Entregues
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Análise de Produção</CardTitle>
                            <CardDescription>O engajamento do treinador com a plataforma</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                                        <div className="bg-blue-100 p-3 rounded-xl">
                                            <Briefcase className="w-6 h-6 text-blue-600" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-blue-900">Capacidade Operacional</h4>
                                            <p className="text-xs text-blue-700">Média de {(coachStats.plansCreated / (coachStats.studentsManaged || 1)).toFixed(1)} planos por aluno</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 p-4 bg-orange-50/50 rounded-2xl border border-orange-100">
                                        <div className="bg-orange-100 p-3 rounded-xl">
                                            <TrendingUp className="w-6 h-6 text-orange-600" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-orange-900">Riqueza de Conteúdo</h4>
                                            <p className="text-xs text-orange-700">{coachStats.customExercises} variações de técnicas na biblioteca</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-sm text-gray-600 leading-relaxed">
                                        Este treinador possui um volume de <span className="font-bold text-gray-900">{coachStats.studentsManaged} alunos</span> e já utilizou a IA para gerar <span className="font-bold text-gray-900">{coachStats.plansCreated} roteiros de treino</span>. 
                                        {coachStats.customExercises > 5 ? ' Ele possui uma biblioteca personalizada saudável.' : ' A biblioteca de exercícios customizados está baixa, sugerindo uso massivo de biblioteca padrão.'}
                                    </p>
                                    <Button variant="link" className="text-green-600 p-0 h-auto" onClick={() => router.push(`/admin/content?trainerId=${user.id}`)}>
                                        Ver todos os exercícios criados <ExternalLink className="w-4 h-4 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- Tab: Financial (Partners Only) --- */}
                {partnerStats && (
                    <TabsContent value="financial" className="space-y-6 outline-none">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <Card className="bg-green-600 text-white border-green-700 col-span-1 lg:col-span-2">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-semibold uppercase tracking-wider opacity-80">Receita Total Estimada (Bruto)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-4xl font-black">R$ {partnerStats.revenueTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    <p className="text-xs text-green-100 mt-2 flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" /> Crescimento de 12% vs mês anterior (Draft)
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="border-green-200">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Comissão de Parceria (Take Rate)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-green-700">R$ {partnerStats.commissionRetained.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    <Badge variant="secondary" className="mt-1 bg-blue-100 text-blue-700 hover:bg-blue-100 border-none uppercase font-bold text-[10px]">
                                        {partnerStats.partnerTier} ({(partnerStats.commissionRate * 100).toFixed(0)}%)
                                    </Badge>
                                    {partnerStats.timestamp && (
                                        <p className="text-[8px] text-gray-300 mt-2 italic">Sincronizado: {new Date(partnerStats.timestamp).toLocaleTimeString()}</p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="border-green-200">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status Stripe Connect</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-2">
                                        <Badge className={`${partnerStats.stripeStatus === 'active' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                            {partnerStats.stripeStatus.toUpperCase()}
                                        </Badge>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-2">Pagamentos: {partnerStats.payoutsEnabled ? 'Habilitados' : 'Bloqueados'}</p>
                                </CardContent>
                            </Card>

                            <Card className="border-green-200">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ciclo de Repasse</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-lg font-bold capitalize">{partnerStats.payoutSchedule}</div>
                                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter">Próximo: Quarta-feira</p>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <CreditCard className="w-5 h-5 text-green-600" />
                                    Detalhamento de Cobrança B2B e Assinantes
                                </CardTitle>
                                <CardDescription>Consolidado de licenças e funil do parceiro</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between py-2 border-b border-gray-50">
                                            <span className="text-sm text-gray-600">Alunos Ativos (Licenças)</span>
                                            <span className="font-bold text-green-600">{partnerStats.activeStudents} un</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2 border-b border-gray-50">
                                            <span className="text-sm text-gray-600">Churn (Cancelamentos)</span>
                                            <span className="font-bold text-red-500">{partnerStats.churnedStudents} un</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2 border-b border-gray-50">
                                            <span className="text-sm text-gray-600">Ticket Médio</span>
                                            <span className="font-bold">R$ {partnerStats.activeStudents > 0 ? (partnerStats.revenueTotal / partnerStats.activeStudents).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2 font-bold text-lg text-green-700">
                                            <span>Total a Repassar (Net MRR)</span>
                                            <span>R$ {(partnerStats.revenueTotal - partnerStats.commissionRetained).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-bold text-gray-700">Planos Base (Ofertas) Completas: {partnerStats.offers?.length || 0}</h4>
                                        {partnerStats.offers?.map(offer => (
                                            <div key={offer.id} className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-100">
                                                <div className="text-xs">
                                                    <p className="font-bold text-gray-800">{offer.name}</p>
                                                    <p className="text-gray-500">R$ {offer.price?.toFixed(2)} / mês</p>
                                                </div>
                                                <Badge variant="outline" className="text-[10px]">{offer._count?.subscriptions} ativos</Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-8 border-t border-gray-100 pt-6">
                                    <h4 className="font-bold text-gray-900 mb-4">Lista de Alunos Ativos</h4>
                                    {partnerStats.studentsList?.length > 0 ? (
                                        <div className="space-y-3">
                                            {partnerStats.studentsList.map(sub => (
                                                <div key={sub.id} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-8 w-8">
                                                            <AvatarImage src={sub.user?.image} />
                                                            <AvatarFallback>{sub.user?.name?.[0] || '?'}</AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-800">{sub.user?.name || sub.email}</p>
                                                            <p className="text-xs text-gray-500">{sub.offerName} (R$ {sub.price?.toFixed(2)})</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-gray-400">
                                                        Desde: {format(new Date(sub.createdAt), 'dd/MM/yyyy')}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-400 italic">Nenhum aluno ativo neste parceiro.</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    )
}

function AlertCircle(props) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    )
}
