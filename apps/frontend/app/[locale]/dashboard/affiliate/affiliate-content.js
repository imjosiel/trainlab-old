'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Users, DollarSign, Copy, Check, Banknote, AlertCircle, Loader2, ExternalLink, Link2, Sparkles, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AffiliateReport from '@/components/dashboard/affiliate-report'

export default function AffiliateDashboardContent({ affiliate }) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [activateLoading, setActivateLoading] = useState(false)
  const [activateError, setActivateError] = useState(null)
  const [currentStatus, setCurrentStatus] = useState(affiliate?.stripeAccountStatus ?? 'not_started')

  // ─── Ativar conta de afiliado (self-service) ────────────────────────────────
  const handleActivateAccount = useCallback(async () => {
    setActivateLoading(true)
    setActivateError(null)
    try {
      const res = await fetch('/api/backend/affiliate/connect/setup', { method: 'POST' })
      if (res.ok) {
        window.location.reload()
      } else {
        const data = await res.json().catch(() => ({}))
        setActivateError(data.error || 'Erro ao ativar conta. Tente novamente.')
      }
    } catch {
      setActivateError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setActivateLoading(false)
    }
  }, [])

  const [referralLink, setReferralLink] = useState(null)

  // Resolve origin no client para evitar hydration mismatch
  useEffect(() => {
    if (affiliate?.referralCode) {
      setReferralLink(`${window.location.origin}/?ref=${affiliate.referralCode}`)
    }
  }, [affiliate?.referralCode])

  const copyToClipboard = () => {
    if (!referralLink) return
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ─── Stripe Connect Setup ──────────────────────────────────────────────────
  const handleSetupStripeConnect = useCallback(() => {
    // Redireciona para a página dedicada de onboarding Stripe (com embedded components)
    router.push('/dashboard/affiliate/onboarding')
  }, [router])

  const handleSyncStatus = useCallback(async () => {
    setSyncLoading(true)
    try {
      const res = await fetch('/api/backend/affiliate/connect/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setCurrentStatus(data.stripeAccountStatus)
        window.location.reload()
      }
    } catch {
      // silently fail
    } finally {
      setSyncLoading(false)
    }
  }, [])

  if (!affiliate) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="border-dashed">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-3">
              <Link2 className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-xl">Programa de Afiliados</CardTitle>
            <CardDescription className="max-w-md mx-auto">
              Indique treinadores para a plataforma e ganhe comissão sobre as assinaturas dos alunos deles.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <Button
              onClick={handleActivateAccount}
              disabled={activateLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              {activateLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Ativando...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Ativar Conta de Afiliado</>
              )}
            </Button>
            {activateError && (
              <p className="text-sm text-red-600">{activateError}</p>
            )}
            <p className="text-xs text-gray-400">
              Ao ativar, um código de indicação será gerado automaticamente.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isConnectActive = currentStatus === 'active'
  const isConnectPending = currentStatus === 'pending'
  const isConnectRestricted = currentStatus === 'restricted'
  const needsSetup = currentStatus === 'not_started' || !affiliate.stripeAccountId
  const hasPendingBalance = affiliate.pendingBalance > 0

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard de Afiliado</h1>
        <p className="text-gray-500 text-sm">
          Acompanhe suas indicações e ganhos.
        </p>
      </div>

      {/* ─── Alerta de Conta Bancária ─────────────────────────────────────────── */}
      {!isConnectActive && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0" />
            <div>
              <CardTitle className="text-base text-yellow-400">
                {needsSetup
                  ? 'Configure sua conta bancária'
                  : isConnectPending
                  ? 'Complete seu cadastro bancário'
                  : 'Conta bancária com restrições'}
              </CardTitle>
              <CardDescription className="text-yellow-400/70">
                {needsSetup
                  ? 'Para receber suas comissões automaticamente, configure sua conta bancária via Stripe.'
                  : isConnectPending
                  ? 'Seu cadastro bancário está pendente. Complete as informações solicitadas pelo Stripe.'
                  : 'Sua conta bancária possui restrições. Verifique os dados no Stripe.'}
                {hasPendingBalance && !isConnectActive && (
                  <> Você tem <strong>R$ {(affiliate.pendingBalance / 100).toFixed(2)}</strong> em comissões aguardando configuração.</>
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex gap-3">
            {needsSetup ? (
              <Button
                onClick={handleSetupStripeConnect}
                className="bg-yellow-500 hover:bg-yellow-600 text-black"
              >
                <Banknote className="mr-2 h-4 w-4" /> Configurar Conta Bancária
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleSetupStripeConnect}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black"
                >
                  <ExternalLink className="mr-2 h-4 w-4" /> Completar Cadastro
                </Button>
                <Button
                  onClick={handleSyncStatus}
                  disabled={syncLoading}
                  variant="outline"
                  className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                >
                  {syncLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar Status'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Métricas ────────────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Saldo Disponível</CardTitle>
            <DollarSign className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">
              R$ {(affiliate.availableBalance / 100).toFixed(2)}
            </p>
            {isConnectActive && (
              <p className="text-xs text-gray-500 mt-1">Gerenciado pelo Stripe Connect</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              {isConnectActive ? 'Em Trânsito' : 'Saldo Pendente'}
            </CardTitle>
            <DollarSign className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">
              R$ {(affiliate.pendingBalance / 100).toFixed(2)}
            </p>
            {!isConnectActive && hasPendingBalance && (
              <p className="text-xs text-yellow-400/70 mt-1">Configure conta bancária para liberar</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Parceiros Indicados</CardTitle>
            <Users className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900">
              {affiliate._count?.referredPartners ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Conta Bancária (quando ativa) ───────────────────────────────────── */}
      {isConnectActive && (
        <Card className="border-green-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="w-4 h-4 text-green-500" />
                Conta Bancária
              </CardTitle>
              <CardDescription>
                Sua conta está ativa. As comissões são transferidas automaticamente.
              </CardDescription>
            </div>
            <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-3 py-1 rounded-full font-medium">
              ✓ Ativa
            </span>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button
              onClick={handleSyncStatus}
              disabled={syncLoading}
              variant="outline"
              size="sm"
              className="text-gray-500"
            >
              {syncLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sincronizar Status
            </Button>
            <a
              href="https://connect.stripe.com/express_login"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm" className="text-green-600 border-green-200 hover:bg-green-50">
                <ExternalLink className="h-4 w-4 mr-2" />
                Acessar Stripe Dashboard
              </Button>
            </a>
          </CardContent>
        </Card>
      )}

      {/* ─── Link de Indicação ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seu Link de Indicação</CardTitle>
          <CardDescription>
            Compartilhe este link com treinadores. Você ganha comissão sobre as assinaturas dos alunos deles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {referralLink ? (
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 truncate">
                {referralLink}
              </code>
              <button
                onClick={copyToClipboard}
                className="bg-green-50 border border-green-200 text-green-600 hover:bg-green-100 px-4 py-3 rounded-lg transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Nenhum código de indicação disponível.</p>
          )}
        </CardContent>
      </Card>

      {/* ─── Tabs: Histórico + Relatório ────────────────────────────────────── */}
      <Tabs defaultValue="history" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="history">Histórico de Ganhos</TabsTrigger>
          <TabsTrigger value="report">Relatório Detalhado</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <EarningsHistory />
        </TabsContent>

        <TabsContent value="report">
          <AffiliateReport />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * Sub-componente paginado que busca ganhos do /api/backend/affiliate/earnings
 */
function EarningsHistory() {
  const [earnings, setEarnings] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const limit = 20

  const fetchEarnings = useCallback(async (targetPage = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(limit),
      })
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/backend/affiliate/earnings?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEarnings(data.earnings)
        setPage(data.page)
        setTotalPages(data.totalPages)
        setTotal(data.total)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchEarnings(1)
  }, [fetchEarnings])

  const handleFilter = () => {
    fetchEarnings(1)
  }

  const clearFilters = () => {
    setStartDate('')
    setEndDate('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de Ganhos</CardTitle>
        <CardDescription>
          {total > 0 ? `${total} comissões registradas` : 'Suas comissões aparecerão aqui.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtros de data */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">De</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">Até</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleFilter}>
            <CalendarDays className="w-3 h-3 mr-1" /> Filtrar
          </Button>
          {(startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-400">
              Limpar
            </Button>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-green-600" />
          </div>
        ) : earnings.length > 0 ? (
          <div className="space-y-3">
            {earnings.map((earning) => (
              <div
                key={earning.id}
                className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-4"
              >
                <div>
                  <p className="text-sm text-gray-900 font-medium">
                    R$ {(earning.earnedAmount / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(earning.createdAt).toLocaleDateString('pt-BR')}
                    {' · '}
                    <span className={
                      earning.status === 'available' ? 'text-green-600' :
                      earning.status === 'paid' ? 'text-green-600' :
                      earning.status === 'pending' ? 'text-yellow-500' :
                      'text-gray-400'
                    }>
                      {earning.status === 'available' ? 'Transferido' :
                       earning.status === 'paid' ? 'Pago' :
                       earning.status === 'pending' ? 'Pendente' :
                       earning.status === 'cancelled' ? 'Cancelado' : earning.status}
                    </span>
                  </p>
                </div>
                <span className="text-xs text-gray-500">
                  Base: R$ {(earning.baseAmount / 100).toFixed(2)} · Taxa: {Math.round(earning.commissionRate * 100)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm text-center py-8">
            Nenhum ganho registrado{startDate || endDate ? ' neste período' : ' ainda'}. Compartilhe seu link e comece a indicar!
          </p>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => fetchEarnings(page - 1)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
            </Button>
            <span className="text-sm text-gray-500">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => fetchEarnings(page + 1)}
            >
              Próxima <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
