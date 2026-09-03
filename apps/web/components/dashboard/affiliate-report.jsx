'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { TrendingUp, TrendingDown, Minus, Users, DollarSign, Loader2, RefreshCw, BarChart3, Download, Calendar, Award } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'

/**
 * Relatório detalhado de afiliados — breakdown por parceiro + projeção.
 * Busca dados via GET /api/affiliate/report.
 */
export default function AffiliateReport() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPartner, setSelectedPartner] = useState(null)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backend/affiliate/report')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Erro ao carregar relatório')
      }
      setData(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-8 text-center">
          <p className="text-red-600 text-sm mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchReport}>
            <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const { partners, projection } = data
  const formatBRL = (cents) => `R$ ${(cents / 100).toFixed(2)}`

  const TrendIcon = projection.trend === 'up' ? TrendingUp :
                    projection.trend === 'down' ? TrendingDown : Minus
  const trendColor = projection.trend === 'up' ? 'text-green-600' :
                     projection.trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
  const trendLabel = projection.trend === 'up' ? 'Crescendo' :
                     projection.trend === 'down' ? 'Diminuindo' : 'Estável'

  const exportCSV = () => {
    const headers = ['Parceiro', 'Tier', 'Status', 'Alunos Ativos', 'Total Ganho (R$)', 'Este Mês (R$)', 'Última Comissão']
    const rows = partners.map(p => [
      p.name,
      p.tier || 'starter',
      p.status === 'approved' ? 'Ativo' : p.status === 'pending' ? 'Pendente' : p.status,
      p.activeStudentsCount,
      (p.totalEarned / 100).toFixed(2),
      (p.earnedThisMonth / 100).toFixed(2),
      p.lastEarningDate ? new Date(p.lastEarningDate).toLocaleDateString('pt-BR') : '-',
    ])
    // Totais
    rows.push([
      'TOTAL', '', '',
      partners.reduce((s, p) => s + p.activeStudentsCount, 0),
      (partners.reduce((s, p) => s + p.totalEarned, 0) / 100).toFixed(2),
      (partners.reduce((s, p) => s + p.earnedThisMonth, 0) / 100).toFixed(2),
      '',
    ])

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-afiliado-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* ─── Cards de Projeção ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MRR Estimado</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatBRL(projection.estimatedMrr)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Baseado no mês anterior completo</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ganho Este Mês</CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatBRL(projection.currentMonthTotal)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Mês anterior: {formatBRL(projection.lastMonthTotal)}
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tendência</CardTitle>
            <TrendIcon className={`h-4 w-4 ${trendColor}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${trendColor}`}>
              {trendLabel}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {partners.length} parceiro{partners.length !== 1 ? 's' : ''} indicado{partners.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Gráfico de Evolução ──────────────────────────────────────── */}
      {projection.earningsByMonth?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução Mensal de Comissões</CardTitle>
            <CardDescription>Últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projection.earningsByMonth.map(m => ({
                  ...m,
                  totalBRL: m.total / 100,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickFormatter={(v) => `R$${v}`}
                  />
                  <Tooltip
                    formatter={(value) => [`R$ ${Number(value).toFixed(2)}`, 'Comissão']}
                    labelStyle={{ color: '#374151' }}
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalBRL"
                    stroke="#16a34a"
                    strokeWidth={2.5}
                    dot={{ fill: '#16a34a', r: 4 }}
                    activeDot={{ r: 6, fill: '#16a34a' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Tabela de Parceiros ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Parceiros Indicados</CardTitle>
            <CardDescription>
              Detalhamento de ganhos e alunos por parceiro que você indicou
            </CardDescription>
          </div>
          {partners.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-2" /> Exportar CSV
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {partners.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                Nenhum parceiro indicado ainda. Compartilhe seu link de indicação!
              </p>
            </div>
          ) : (
            <>
              {/* Desktop: tabela */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Parceiro</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Tier</th>
                      <th className="text-center py-3 px-2 font-medium text-muted-foreground">Alunos</th>
                      <th className="text-right py-3 px-2 font-medium text-muted-foreground">Total Ganho</th>
                      <th className="text-right py-3 px-2 font-medium text-muted-foreground">Este Mês</th>
                      <th className="text-right py-3 px-2 font-medium text-muted-foreground">Última Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partners.map((p) => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted transition-colors cursor-pointer" onClick={() => setSelectedPartner(p)}>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-3">
                            {p.image ? (
                              <img src={p.image} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-bold">
                                {(p.name || '?')[0].toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-foreground">{p.name}</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                p.status === 'approved' ? 'bg-green-100 text-green-700' :
                                p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-muted text-muted-foreground'
                              }`}>
                                {p.status === 'approved' ? 'Ativo' :
                                 p.status === 'pending' ? 'Pendente' : p.status}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <span className="capitalize text-muted-foreground">{p.tier || 'starter'}</span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Users className="w-3 h-3" />
                            {p.activeStudentsCount}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right font-medium text-foreground">
                          {formatBRL(p.totalEarned)}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span className={p.earnedThisMonth > 0 ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                            {formatBRL(p.earnedThisMonth)}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right text-muted-foreground text-xs">
                          {p.lastEarningDate
                            ? new Date(p.lastEarningDate).toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-bold">
                      <td className="py-3 px-2 text-foreground" colSpan={2}>Total</td>
                      <td className="py-3 px-2 text-center text-foreground">
                        {partners.reduce((s, p) => s + p.activeStudentsCount, 0)}
                      </td>
                      <td className="py-3 px-2 text-right text-foreground">
                        {formatBRL(partners.reduce((s, p) => s + p.totalEarned, 0))}
                      </td>
                      <td className="py-3 px-2 text-right text-green-600">
                        {formatBRL(partners.reduce((s, p) => s + p.earnedThisMonth, 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile: cards empilhados */}
              <div className="md:hidden space-y-3">
                {partners.map((p) => (
                  <div key={p.id} className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:border-green-300 transition-colors" onClick={() => setSelectedPartner(p)}>
                    <div className="flex items-center gap-3">
                      {p.image ? (
                        <img src={p.image} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold">
                          {(p.name || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="capitalize text-xs text-muted-foreground">{p.tier || 'starter'}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            p.status === 'approved' ? 'bg-green-100 text-green-700' :
                            p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {p.status === 'approved' ? 'Ativo' : p.status === 'pending' ? 'Pendente' : p.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Alunos</p>
                        <p className="text-sm font-medium text-foreground">{p.activeStudentsCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-sm font-medium text-foreground">{formatBRL(p.totalEarned)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Este mês</p>
                        <p className={`text-sm font-medium ${p.earnedThisMonth > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {formatBRL(p.earnedThisMonth)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {/* Total mobile */}
                <div className="border-t-2 border-border pt-3 grid grid-cols-3 gap-2 text-center font-bold">
                  <div>
                    <p className="text-xs text-muted-foreground">Alunos</p>
                    <p className="text-sm text-foreground">{partners.reduce((s, p) => s + p.activeStudentsCount, 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-sm text-foreground">{formatBRL(partners.reduce((s, p) => s + p.totalEarned, 0))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Este mês</p>
                    <p className="text-sm text-green-600">{formatBRL(partners.reduce((s, p) => s + p.earnedThisMonth, 0))}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {/* ─── Drill-down Sheet ──────────────────────────────────────── */}
      <Sheet open={!!selectedPartner} onOpenChange={(open) => !open && setSelectedPartner(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedPartner && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3 mb-2">
                  {selectedPartner.image ? (
                    <img src={selectedPartner.image} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-lg font-bold">
                      {(selectedPartner.name || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <SheetTitle>{selectedPartner.name}</SheetTitle>
                    <SheetDescription>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        selectedPartner.status === 'approved' ? 'bg-green-100 text-green-700' :
                        selectedPartner.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {selectedPartner.status === 'approved' ? 'Ativo' : selectedPartner.status === 'pending' ? 'Pendente' : selectedPartner.status}
                      </span>
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              {/* Métricas */}
              <div className="grid grid-cols-2 gap-3 my-6">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <Award className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Tier</p>
                  <p className="text-sm font-semibold capitalize">{selectedPartner.tier || 'starter'}</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <Users className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Alunos Ativos</p>
                  <p className="text-sm font-semibold">{selectedPartner.activeStudentsCount}</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <DollarSign className="w-4 h-4 text-green-500 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Total Ganho</p>
                  <p className="text-sm font-semibold text-green-600">{formatBRL(selectedPartner.totalEarned)}</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <Calendar className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Indicado em</p>
                  <p className="text-sm font-semibold">
                    {selectedPartner.joinedAt
                      ? new Date(selectedPartner.joinedAt).toLocaleDateString('pt-BR')
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Gráfico de Ganhos por Mês */}
              {selectedPartner.earningsByMonth?.length > 0 ? (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Ganhos Mensais</h4>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={selectedPartner.earningsByMonth.map(m => ({
                        ...m,
                        totalBRL: m.total / 100,
                        label: new Date(m.month + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => `R$${v}`} />
                        <Tooltip
                          formatter={(value) => [`R$ ${Number(value).toFixed(2)}`, 'Comissão']}
                          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                        />
                        <Bar dataKey="totalBRL" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <BarChart3 className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">Nenhuma comissão gerada por este parceiro ainda.</p>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
