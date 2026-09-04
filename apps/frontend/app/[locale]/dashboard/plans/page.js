'use client'

import { ROLES } from '@/lib/constants'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, FileText, Clock, CheckCircle2, XCircle, Plus, Filter, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export default function PlansPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const t = useTranslations('PlansPage')
  const locale = useLocale()

  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  const STATUS_LABELS = {
    PENDING: { label: t('labelPendingState'), color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    APPROVED: { label: t('labelApprovedState'), color: 'bg-green-100 text-green-800 border-green-200' },
    REJECTED: { label: t('labelRejectedState'), color: 'bg-red-100 text-red-800 border-red-200' },
    DELIVERED: { label: t('labelDeliveredState'), color: 'bg-blue-100 text-blue-800 border-blue-200' },
    COMPLETED: { label: t('labelCompletedState'), color: 'bg-purple-100 text-purple-800 border-purple-200' },
  }

  const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)

  const handleDeletePlan = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm("Tem certeza que deseja excluir este plano? Esta ação não pode ser desfeita.")) return

    try {
      const res = await fetch(`/api/backend/training-plans/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success("Plano excluído com sucesso")
      setPlans(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      toast.error("Erro ao excluir plano")
    }
  }

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/backend/training-plans')
      if (response.ok) {
        const data = await response.json()
        setPlans(data.plans || [])
      }
    } catch (error) {
      console.error('Error fetching plans:', error)
      toast.error(t('errorLoading'))
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const getFilteredPlans = () => {
    if (activeTab === 'all') return plans
    return plans.filter(plan => plan.status === activeTab.toUpperCase())
  }

  const filteredPlans = getFilteredPlans()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-600 mt-1">
            {isTrainer ? t('subtitleTrainer') : t('subtitleAthlete')}
          </p>
        </div>

        {isTrainer && (
          <Button
            onClick={() => router.push('/dashboard/plans/create')}
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('btnCreatePlan')}
          </Button>
        )}
      </div>

      {/* Tabs for filtering */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">
            {t('tabAll')} <Badge className="ml-2" variant="secondary">{plans.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pending">
            {t('tabPending')} <Badge className="ml-2" variant="secondary">{plans.filter(p => p.status === 'PENDING').length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved">
            {t('tabApproved')} <Badge className="ml-2" variant="secondary">{plans.filter(p => p.status === 'APPROVED').length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="delivered">
            {t('tabDelivered')} <Badge className="ml-2" variant="secondary">{plans.filter(p => p.status === 'DELIVERED').length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed">
            {t('tabCompleted')} <Badge className="ml-2" variant="secondary">{plans.filter(p => p.status === 'COMPLETED').length}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Plans List */}
      {filteredPlans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {activeTab === 'all' ? t('emptyTitleAll') : t('emptyTitleFiltered', { status: t(`tab${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`).toLowerCase() })}
            </h3>
            <p className="text-gray-600 mb-4 text-center max-w-md">
              {isTrainer
                ? t('emptyDescTrainer')
                : t('emptyDescAthlete')}
            </p>
            {isTrainer && activeTab === 'all' && (
              <Button
                onClick={() => router.push('/dashboard/plans/create')}
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('btnCreateFirstPlan')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredPlans.map((plan) => (
            <Card key={plan.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push(`/dashboard/plans/${plan.id}`)}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">{plan.title}</CardTitle>
                    <div className="flex items-center space-x-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={plan.athlete?.image || ''} />
                        <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                          {getInitials(plan.athlete?.name || plan.student?.name || 'A')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{plan.athlete?.name || plan.student?.name || t('labelUnassigned')}</p>
                        {plan.trainer && (
                          <p className="text-xs text-gray-500">{t('labelByTrainer', { name: plan.trainer.name })}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge className={STATUS_LABELS[plan.status].color} variant="outline">
                    {STATUS_LABELS[plan.status].label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {t('labelDurationDays')}
                  </span>
                  <span className="font-medium">{t('durationDays', { days: plan.duration })}</span>
                </div>

                {plan.trainingSessions && plan.trainingSessions.length > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{t('labelProgress')}</span>
                    <span className="font-medium">
                      {t('sessionsCompleted', { completed: plan.trainingSessions.filter(s => s.completed).length, total: plan.trainingSessions.length })}
                    </span>
                  </div>
                )}

                <div className="text-xs text-gray-500">
                  {t('labelCreatedAt', { date: new Date(plan.createdAt).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' }) })}
                </div>

                <div className="flex gap-2 w-full mt-4">
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/dashboard/plans/${plan.id}`)
                    }}
                  >
                    {t('btnViewDetails')}
                  </Button>
                  
                  {isTrainer && (
                    <Button 
                      title="Excluir Plano"
                      variant="destructive" 
                      onClick={(e) => handleDeletePlan(plan.id, e)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}