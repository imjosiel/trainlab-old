'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DollarSign, Users, Copy, Check, Link2, ArrowRight, TrendingUp, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Dashboard Home do Afiliado — exibe resumo de indicações, saldo e link de referral.
 * Renderizado no dashboard home (/dashboard) quando o usuário é afiliado puro.
 * Dados completos estão na tela dedicada (/dashboard/affiliate).
 */
export default function AffiliateHome({ data }) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  const referralLink = data?.referralCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${data.referralCode}`
    : null

  const copyToClipboard = () => {
    if (!referralLink) return
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!data) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Link2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-foreground mb-1">Conta de Afiliado</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Sua conta de afiliado está sendo configurada. Em breve você poderá acompanhar suas indicações.
          </p>
        </CardContent>
      </Card>
    )
  }

  const needsSetup = data.stripeAccountStatus === 'not_started' || !data.stripeAccountId

  return (
    <div className="space-y-6">
      {/* Alerta de setup bancário */}
      {needsSetup && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0" />
            <div>
              <CardTitle className="text-base text-yellow-800">Configure sua conta bancária</CardTitle>
              <CardDescription className="text-yellow-700">
                Para receber suas comissões, configure sua conta via Stripe.
                {data.pendingBalance > 0 && (
                  <> Você tem <strong>R$ {(data.pendingBalance / 100).toFixed(2)}</strong> em comissões aguardando.</>
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push('/dashboard/affiliate/onboarding')}
              className="bg-yellow-500 hover:bg-yellow-600 text-black"
            >
              Configurar Conta Bancária
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Disponível</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {(data.availableBalance / 100).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Pronto para transferência</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Pendente</CardTitle>
            <DollarSign className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {(data.pendingBalance / 100).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Aguardando liberação</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Parceiros Indicados</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.referredPartnersCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Indicações ativas</p>
          </CardContent>
        </Card>
      </div>

      {/* Link de Indicação */}
      {referralLink && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4 text-green-600" />
              Seu Link de Indicação
            </CardTitle>
            <CardDescription>
              Compartilhe com treinadores e ganhe comissão sobre as assinaturas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-muted border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground truncate">
                {referralLink}
              </code>
              <Button
                variant="outline"
                onClick={copyToClipboard}
                className="shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Últimos ganhos */}
      {data.recentEarnings?.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Últimos Ganhos</CardTitle>
              <CardDescription>Comissões mais recentes</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/dashboard/affiliate')}
              className="text-green-600"
            >
              Ver tudo <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentEarnings.map((earning) => (
                <div
                  key={earning.id}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      R$ {(earning.earnedAmount / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(earning.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    earning.status === 'available' || earning.status === 'paid'
                      ? 'bg-green-100 text-green-700'
                      : earning.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {earning.status === 'available' ? 'Transferido' :
                     earning.status === 'paid' ? 'Pago' :
                     earning.status === 'pending' ? 'Pendente' :
                     earning.status === 'cancelled' ? 'Cancelado' : earning.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
