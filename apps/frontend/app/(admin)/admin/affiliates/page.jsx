'use client'

import { useState, useEffect, useCallback } from 'react'
import { LinkIcon, Search, Users, AlertCircle, ShieldAlert, CheckCircle, XCircle } from 'lucide-react'

export default function AdminAffiliatesPage() {
  const [activeTab, setActiveTab] = useState('list') // 'list' | 'reserved'
  
  // Affiliates List State
  const [affiliates, setAffiliates] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  // Reserved Earnings State
  const [reservedEarnings, setReservedEarnings] = useState([])
  const [reservedTotal, setReservedTotal] = useState(0)
  const [reservedLoading, setReservedLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(null) // holds earningId being processed

  const fetchAffiliates = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    const res = await fetch(`/api/backend/admin/affiliates?${params}`)
    const data = await res.json()
    setAffiliates(data.affiliates || [])
    setTotal(data.total || 0)
    setTotalPages(data.pages || 1)
    setLoading(false)
  }, [page])

  const fetchReservedEarnings = useCallback(async () => {
    setReservedLoading(true)
    try {
      const res = await fetch('/api/backend/admin/affiliates/reserved-earnings')
      const data = await res.json()
      setReservedEarnings(data.earnings || [])
      setReservedTotal(data.totalReserved || 0)
    } catch (err) {
      console.error('Error fetching reserved earnings:', err)
    } finally {
      setReservedLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'list') {
      fetchAffiliates()
    } else {
      fetchReservedEarnings()
    }
  }, [activeTab, fetchAffiliates, fetchReservedEarnings])

  const handleResolveEarning = async (earningId, action) => {
    const confirmMsg = action === 'release' 
      ? 'Deseja liberar esta comissão para o afiliado? Ela será marcada como pendente e somada ao saldo dele.'
      : 'Deseja cancelar esta comissão? Ela será retida definitivamente pela plataforma.'
    
    if (!confirm(confirmMsg)) return

    setActionLoading(earningId)
    try {
      const res = await fetch('/api/backend/admin/affiliates/reserved-earnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          earningIds: [earningId],
          action
        })
      })
      const data = await res.json()
      if (res.ok) {
        alert(data.message || 'Operação realizada com sucesso.')
        fetchReservedEarnings()
      } else {
        alert(data.error || 'Erro ao processar a ação.')
      }
    } catch (err) {
      console.error(err)
      alert('Erro interno de conexão.')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Afiliados & Comissões</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerenciamento de contas de afiliados e comissões reservadas.
          </p>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-muted">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Lista de Afiliados
        </button>
        <button
          onClick={() => setActiveTab('reserved')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'reserved'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>Comissões Reservadas</span>
          {reservedEarnings.length > 0 && (
            <span className="bg-amber-500 text-black text-xs font-bold rounded-full px-2 py-0.5 animate-pulse">
              {reservedEarnings.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'list' ? (
        <>
          <div className="rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Nome</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Email</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Código</th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">Saldo Pendente</th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">Saldo Disponível</th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">Parceiros</th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">Ganhos</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">Carregando...</td></tr>
                  ) : affiliates.length === 0 ? (
                    <tr><td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">Nenhum afiliado encontrado.</td></tr>
                  ) : affiliates.map((a) => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium">{a.user?.name ?? '—'}</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{a.user?.email ?? '—'}</td>
                      <td className="p-3 text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.status === 'suspended' 
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' 
                            : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        }`}>
                          {a.status === 'suspended' ? 'Suspenso' : 'Ativo'}
                        </span>
                      </td>
                      <td className="p-3 text-sm">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{a.referralCode}</code>
                      </td>
                      <td className="p-3 text-sm text-right font-medium">R$ {(a.pendingBalance / 100).toFixed(2)}</td>
                      <td className="p-3 text-sm text-right font-medium text-green-600">R$ {(a.availableBalance / 100).toFixed(2)}</td>
                      <td className="p-3 text-sm text-right">{a._count?.referredPartners ?? 0}</td>
                      <td className="p-3 text-sm text-right">{a._count?.earnings ?? 0}</td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {new Date(a.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-50 hover:bg-muted transition-colors"
              >
                Anterior
              </button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-50 hover:bg-muted transition-colors"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4 flex gap-3 text-sm text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">O que são Comissões Reservadas?</p>
              <p className="mt-1">
                Quando um afiliado é suspenso, suas comissões não são repassadas a ele e ficam retidas temporariamente na conta da plataforma.
                Você pode optar por <strong>Liberar</strong> a comissão caso a situação dele se regularize, ou <strong>Reter/Cancelar</strong> a comissão definitivamente, mantendo o saldo no caixa do SaaS.
              </p>
              {reservedTotal > 0 && (
                <p className="mt-2 font-bold">
                  Total de fundos atualmente retidos: R$ {(reservedTotal / 100).toFixed(2)}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Afiliado</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Data da Venda</th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">Valor Bruto</th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">Comissão</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Invoice ID</th>
                    <th className="text-center p-3 text-sm font-medium text-muted-foreground w-40">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {reservedLoading ? (
                    <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">Carregando...</td></tr>
                  ) : reservedEarnings.length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">Nenhuma comissão reservada pendente de resolução.</td></tr>
                  ) : reservedEarnings.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 text-sm">
                        <div>
                          <span className="font-medium block">{e.affiliate?.user?.name ?? '—'}</span>
                          <span className="text-xs text-muted-foreground">{e.affiliate?.user?.email ?? '—'}</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-3 text-sm text-right">R$ {(e.grossAmount / 100).toFixed(2)}</td>
                      <td className="p-3 text-sm text-right font-medium text-amber-600">R$ {(e.earnedAmount / 100).toFixed(2)}</td>
                      <td className="p-3 text-sm">
                        <code className="text-xs font-mono">{e.invoiceId ?? '—'}</code>
                      </td>
                      <td className="p-3 text-sm text-center">
                        {actionLoading === e.id ? (
                          <span className="text-xs text-muted-foreground">Processando...</span>
                        ) : (
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => handleResolveEarning(e.id, 'release')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-green-100 hover:bg-green-200 text-green-800 transition-colors"
                              title="Liberar para saldo do afiliado"
                            >
                              <CheckCircle className="h-3 w-3" /> Liberar
                            </button>
                            <button
                              onClick={() => handleResolveEarning(e.id, 'cancel')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-red-100 hover:bg-red-200 text-red-800 transition-colors"
                              title="Cancelar comissão e reter valor"
                            >
                              <XCircle className="h-3 w-3" /> Reter
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

