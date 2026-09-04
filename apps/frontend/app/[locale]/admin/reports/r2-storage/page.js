'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, ExternalLink, CheckCircle2, Clock, Cloud } from 'lucide-react'
import Link from 'next/link'

export default function R2StoragePage() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    const fetchData = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/backend/admin/r2-storage')
            if (!res.ok) throw new Error('Erro ao carregar relatório')
            setData(await res.json())
        } catch (e) {
            toast.error(e.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [])

    if (loading) return (
        <div className="flex h-[400px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
    )

    if (!data) return null

    const { summary, byTrainer, recent } = data
    const hlsPct = summary.total > 0 ? Math.round((summary.hlsDone / summary.total) * 100) : 0

    return (
        <div className="space-y-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Cloud className="w-6 h-6 text-orange-500" />
                        Relatório — Cloudflare R2
                    </h1>
                    <p className="text-gray-500 mt-1 text-sm">Vídeos armazenados no R2, status de conversão HLS e distribuição por treinador.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/admin/video-processor"
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors font-medium"
                    >
                        🎬 Processador HLS
                        <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
                <StatCard
                    label="Total de vídeos R2"
                    value={summary.total}
                    icon={<Cloud className="w-5 h-5 text-orange-500" />}
                    bg="bg-orange-50"
                />
                <StatCard
                    label="Convertidos para HLS"
                    value={summary.hlsDone}
                    icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
                    bg="bg-green-50"
                    sub={summary.total > 0 ? `${hlsPct}% do total` : undefined}
                />
                <StatCard
                    label="Pendentes de conversão"
                    value={summary.hlsPending}
                    icon={<Clock className="w-5 h-5 text-yellow-500" />}
                    bg="bg-yellow-50"
                    sub={summary.hlsPending > 0 ? 'Use o Processador HLS' : 'Tudo convertido ✅'}
                />
            </div>

            {/* HLS progress bar */}
            {summary.total > 0 && (
                <div className="bg-white border rounded-xl p-5">
                    <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium text-gray-700">Progresso de conversão HLS</span>
                        <span className="text-gray-500">{summary.hlsDone} / {summary.total}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                                width: `${hlsPct}%`,
                                background: hlsPct === 100
                                    ? 'linear-gradient(90deg, #16a34a, #4ade80)'
                                    : 'linear-gradient(90deg, #f97316, #fb923c)',
                            }}
                        />
                    </div>
                </div>
            )}

            {/* By trainer */}
            {byTrainer.length > 0 && (
                <div className="bg-white border rounded-xl p-5">
                    <h2 className="font-semibold text-gray-800 mb-4">Distribuição por Treinador</h2>
                    <div className="space-y-3">
                        {byTrainer.map(({ trainer, total: t, done, pending }) => {
                            const pct = t > 0 ? Math.round((done / t) * 100) : 0
                            return (
                                <div key={trainer.id}>
                                    <div className="flex items-center justify-between text-sm mb-1">
                                        <span className="text-gray-700 font-medium">{trainer.name}</span>
                                        <span className="text-gray-400 tabular-nums">
                                            {done}/{t} HLS
                                            {pending > 0 && <span className="ml-2 text-yellow-600">({pending} pendente{pending > 1 ? 's' : ''})</span>}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${pct}%`,
                                                background: pct === 100 ? '#16a34a' : '#f97316',
                                            }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Recent exercises table */}
            <div className="bg-white border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b">
                    <h2 className="font-semibold text-gray-800">Vídeos Recentes no R2</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Últimos 50 exercícios com vídeo no R2</p>
                </div>
                {recent.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-sm">Nenhum vídeo R2 encontrado ainda.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                            <tr>
                                <th className="px-5 py-3 text-left">Exercício</th>
                                <th className="px-5 py-3 text-left">Treinador</th>
                                <th className="px-5 py-3 text-center">HLS</th>
                                <th className="px-5 py-3 text-right">Data</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {recent.map(ex => (
                                <tr key={ex.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-5 py-3 font-medium text-gray-800 max-w-xs truncate">
                                        {ex.name}
                                    </td>
                                    <td className="px-5 py-3 text-gray-500">
                                        {ex.trainer?.name || <span className="text-gray-300 italic">Global</span>}
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        {ex.hlsProcessed ? (
                                            <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> HLS
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-yellow-600 text-xs font-medium">
                                                <Clock className="w-3.5 h-3.5" /> Pendente
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-right text-gray-400 text-xs tabular-nums">
                                        {new Date(ex.createdAt).toLocaleDateString('pt-BR')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

function StatCard({ label, value, icon, bg, sub }) {
    return (
        <div className={`${bg} rounded-xl p-5 border border-white`}>
            <div className="flex items-center gap-3 mb-2">
                {icon}
                <span className="text-sm text-gray-600">{label}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
    )
}
