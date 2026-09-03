'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tag, Users, TrendingUp, ArrowRight, AlertCircle, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'

/**
 * Dashboard Home do Parceiro B2B — exibe resumo de ofertas, assinantes e tier.
 * Renderizado no dashboard home (/dashboard) quando o usuário é parceiro puro.
 * Dados completos estão nas telas dedicadas (/dashboard/partner/offers e /dashboard/partner/revenue).
 */
export default function PartnerHome({ data }) {
  const router = useRouter()

  if (!data) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Tag className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-foreground mb-1">Conta de Parceiro</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Sua conta de parceiro está sendo configurada. Complete o onboarding para começar.
          </p>
          <Button
            onClick={() => router.push('/dashboard/partner/onboarding')}
            className="bg-green-600 hover:bg-green-700"
          >
            Completar Cadastro
          </Button>
        </CardContent>
      </Card>
    )
  }

  const needsSetup = data.stripeAccountStatus === 'not_started' || data.stripeAccountStatus === 'restricted'

  return (
    <div className="space-y-6">
      {/* Alerta de setup */}
      {needsSetup && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0" />
            <div>
              <CardTitle className="text-base text-yellow-800">
                {data.stripeAccountStatus === 'not_started' ? 'Configure sua conta bancária' : 'Conta com restrições'}
              </CardTitle>
              <CardDescription className="text-yellow-700">
                {data.stripeAccountStatus === 'not_started'
                  ? 'Para começar a receber pagamentos, configure sua conta via Stripe.'
                  : 'Sua conta bancária possui restrições. Verifique os dados no Stripe.'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push('/dashboard/partner/onboarding')}
              className="bg-yellow-500 hover:bg-yellow-600 text-black"
            >
              {data.stripeAccountStatus === 'not_started' ? 'Configurar Conta' : 'Verificar Status'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ofertas Ativas</CardTitle>
            <Tag className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activeOffersCount}</div>
            <p className="text-xs text-muted-foreground mt-1">de {data.totalOffersCount} ofertas criadas</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assinantes Ativos</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activeSubscribersCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Alunos pagantes</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tier</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{data.tier || 'Starter'}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Taxa plataforma: {((data.commissionRate ?? 0) * 100).toFixed(0)}%
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            <Wallet className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">
              {data.status === 'approved' ? '✓ Aprovado' :
               data.status === 'pending' ? '⏳ Pendente' :
               data.status || 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Conta de parceiro</p>
          </CardContent>
        </Card>
      </div>

      {/* Ações rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ações Rápidas</CardTitle>
            <CardDescription>Gerencie seus planos e receita</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={() => router.push('/dashboard/partner/offers')}
            >
              <Tag className="mr-2 h-4 w-4" />
              Gerenciar Ofertas
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => router.push('/dashboard/partner/revenue')}
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Ver Receita
            </Button>
          </CardContent>
        </Card>

        {/* Ofertas ativas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ofertas Publicadas</CardTitle>
            <CardDescription>Seus planos disponíveis para assinatura</CardDescription>
          </CardHeader>
          <CardContent>
            {data.offerNames?.length > 0 ? (
              <div className="space-y-2">
                {data.offerNames.map((name, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0"
                  >
                    <Tag className="w-3 h-3 text-green-500 shrink-0" />
                    <span className="text-sm truncate">{name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-muted-foreground text-sm mb-3">Nenhuma oferta ativa ainda</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/dashboard/partner/offers')}
                >
                  Criar primeira oferta <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
