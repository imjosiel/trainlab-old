'use client'

import { ROLES } from '@/lib/constants'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Users, Zap, TrendingUp, CreditCard, ArrowRight, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function AdminOverviewPage() {
    const [data, setData] = useState(null)
    const [financeData, setFinanceData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchOverview() {
            try {
                const res = await fetch('/api/backend/admin/overview')
                if (res.ok) {
                    const json = await res.json()
                    setData(json)
                }
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }
        async function fetchFinance() {
            try {
                const res = await fetch('/api/backend/admin/finance')
                if (res.ok) {
                    const json = await res.json()
                    setFinanceData(json)
                }
            } catch (error) {
                console.error(error)
            }
        }

        fetchOverview()
        fetchFinance()
    }, [])

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        )
    }

    if (!data) return null

    const { stats, recentUsers } = data

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-2xl font-bold text-gray-900">Visão Geral do SaaS</h3>
                <p className="text-gray-500 mt-1">Métricas em tempo real da plataforma Player.Action</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="border-green-100 bg-white shadow-sm ring-1 ring-green-500/10">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Receita Mensal (MRR)</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-gray-900">R$ {stats.estimatedMrr.toFixed(2)}</div>
                        <p className="text-xs text-green-600 mt-1 font-medium lg:truncate">Estimativa de assinaturas ativas</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Usuários Totais</CardTitle>
                        <Users className="h-4 w-4 text-gray-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-gray-900">{stats.totalUsers}</div>
                        <p className="text-xs text-gray-500 mt-1 font-medium lg:truncate">
                            <span className="text-blue-600">{stats.totalTrainers} Treinadores</span> &middot; <span className="text-indigo-600">{stats.totalAthletes} Atletas</span>
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Assinaturas Ativas</CardTitle>
                        <CreditCard className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-gray-900">{stats.activeSubscriptions}</div>
                        <p className="text-xs text-gray-500 mt-1 lg:truncate">Usuários com pagamento em dia</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Uso de IA (Planos)</CardTitle>
                        <Zap className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-gray-900">{stats.totalPlans}</div>
                        <p className="text-xs text-gray-500 mt-1 lg:truncate">Planos de treino gerados pelo Groq</p>
                    </CardContent>
                </Card>
            </div>

            {financeData && (
                <Card className="shadow-sm border-gray-200">
                    <CardHeader>
                        <CardTitle>Histórico de Receita (Últimos 6 Meses)</CardTitle>
                        <CardDescription>Cobranças efetivadas com sucesso via Stripe</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={financeData.historicalMrr}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="monthLabel" axisLine={false} tickLine={false} />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(value) => `R$ ${value}`}
                                    />
                                    <Tooltip
                                        formatter={(value) => [`R$ ${value.toFixed(2)}`, 'Receita']}
                                        cursor={{ fill: '#f3f4f6' }}
                                    />
                                    <Bar dataKey="amount" fill="#16a34a" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 shadow-sm">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Últimos Cadastros</CardTitle>
                                <CardDescription>Os 5 usuários mais recentes a entrar na plataforma</CardDescription>
                            </div>
                            <Link href="/admin/users" className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center">
                                Ver todos <ArrowRight className="w-4 h-4 ml-1" />
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentUsers.map(user => (
                                <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${user.roles?.includes(ROLES.PROFESSIONAL) ? 'bg-blue-600' : 'bg-indigo-600'}`}>
                                            {user.name?.charAt(0) || 'U'}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900">{user.name || 'Sem Nome'}</p>
                                            <p className="text-sm text-gray-500">{user.email}</p>
                                        </div>
                                    </div>
                                    <div className="text-left sm:text-right flex flex-row sm:flex-col lg:flex-row items-center sm:items-end lg:items-center gap-2 sm:gap-1 lg:gap-4 pl-14 sm:pl-0">
                                        <div>
                                            {user.subscriptionPlan ? (
                                                <Badge className="bg-green-100 text-green-700 border-green-200">Premium ({user.subscriptionPlan})</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-gray-500">Base / Free</Badge>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-500 w-auto lg:w-24 text-right">
                                            {format(new Date(user.createdAt), "dd 'de' MMM", { locale: ptBR })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {recentUsers.length === 0 && (
                                <p className="text-center text-gray-500 py-4">Nenhum usuário cadastrado ainda.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
