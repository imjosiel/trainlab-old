'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, TrendingUp, DollarSign, Users, AlertCircle, RefreshCw, Star, ArrowUpRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export default function AdminB2BRevenuePage() {
    const [metrics, setMetrics] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const res = await fetch('/api/backend/admin/metrics/b2b')
                if (!res.ok) {
                    throw new Error('Falha ao carregar métricas globais')
                }
                const data = await res.json()
                setMetrics(data)
            } catch (err) {
                console.error(err)
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }

        fetchMetrics()
    }, [])

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-slate-400" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="max-w-xl mx-auto mt-12">
                <Card className="border-red-200 bg-red-50">
                    <CardHeader>
                        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                        <CardTitle className="text-red-700">Erro ao Carregar Dados B2B</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-red-800 mb-6 bg-red-100 p-3 rounded">{error}</p>
                        <Button
                            onClick={() => window.location.reload()}
                            variant="outline"
                            className="bg-white border-red-200 hover:bg-red-50"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Tentar Novamente
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Faturamento Plataforma (B2B)</h1>
                <p className="text-slate-500 mt-2">
                    Visão global das transações gerenciadas pelo Stripe Connect e da comissão bruta retida pelo Player.Action.
                </p>
            </div>

            {/* Top Overview Cards */}
            <div className="grid sm:grid-cols-3 gap-6">
                <Card className="shadow-sm border-slate-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                            Receita da Plataforma (Fee)
                            <TrendingUp className="w-5 h-5 text-green-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-slate-900">
                            {formatCurrency(metrics?.totalPlatformCutMrr || 0)}
                        </div>
                        <p className="text-sm text-green-600 mt-2 font-medium flex items-center">
                            <ArrowUpRight className="w-4 h-4 mr-1" />
                            MRR limpo do B2B
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                            Volume Processado (Gross)
                            <DollarSign className="w-5 h-5 text-blue-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-slate-900">
                            {formatCurrency(metrics?.totalGrossMrr || 0)}
                        </div>
                        <p className="text-sm text-slate-500 mt-2 font-medium">
                            Total pago pelos alunos aos parceiros
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                            Alunos B2B Ativos
                            <Users className="w-5 h-5 text-purple-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-slate-900">
                            {metrics?.totalActiveB2BStudents || 0}
                        </div>
                        <p className="text-sm text-slate-500 mt-2 font-medium">
                            Assinaturas gerenciadas via Connect
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Top Performing Partners */}
            <h2 className="text-xl font-bold text-slate-900 pt-6 px-1 flex items-center">
                <Star className="w-5 h-5 mr-2 text-yellow-500" /> Top 10 Parceiros Lucrativos
            </h2>

            <Card className="shadow-sm border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-medium">Treinador Parceiro</th>
                                <th className="px-6 py-4 font-medium">Tier</th>
                                <th className="px-6 py-4 font-medium">Alunos</th>
                                <th className="px-6 py-4 font-medium text-right">Volume Processado</th>
                                <th className="px-6 py-4 font-medium text-right text-green-700">Receita Retida (Plataforma)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {metrics?.topPartners?.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                                        Nenhum parceiro com assinaturas ativas no momento.
                                    </td>
                                </tr>
                            )}
                            {metrics?.topPartners?.map((p, idx) => (
                                <tr key={p.id} className="bg-white hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                            {p.image ? (
                                                <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-xs text-slate-500">{p.name?.charAt(0)}</span>
                                            )}
                                        </div>
                                        <div className="flex flex-col">
                                            <span>{p.name}</span>
                                            {idx === 0 && <span className="text-[10px] text-yellow-600 font-bold uppercase">🥇 Top 1 Vendedor</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wider">
                                            {p.tier} ({(p.commissionRate * 100).toFixed(0)}%)
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-700 font-medium">
                                        {p.activeStudents}
                                    </td>
                                    <td className="px-6 py-4 text-right text-slate-600 font-medium">
                                        {formatCurrency(p.generatedRevenue)}
                                    </td>
                                    <td className="px-6 py-4 text-right text-green-700 font-bold bg-green-50/30">
                                        {formatCurrency(p.platformFee)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    )
}
