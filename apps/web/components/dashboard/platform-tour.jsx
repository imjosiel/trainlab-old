'use client'

import { ROLES } from '@/lib/constants'
import { useEffect } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'

// ─── Definição dos Steps por Role ────────────────────────────────────────────

const TRAINER_STEPS = [
    {
        popover: {
            title: '⚽ Bem-vindo(a) ao Player.Action!',
            description: 'Sua central de inteligência esportiva. Vamos fazer um tour rápido pelos recursos principais — menos de 1 minuto, prometemos!',
            side: 'over',
            align: 'center',
        },
    },
    {
        element: 'a[href*="/dashboard/students"]',
        popover: {
            title: '👥 Seus Alunos',
            description: 'Cadastre alunos, envie convites por e-mail e acompanhe o progresso de cada um. Os convitados recebem uma notificação in-app para aceitar.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: 'a[href*="/dashboard/exercises"]',
        popover: {
            title: '🏋️ Biblioteca de Exercícios',
            description: 'Monte sua biblioteca particular de exercícios com vídeos, descrições e categorias. A IA usa esse acervo na hora de gerar planos personalizados.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: 'a[href*="/dashboard/plans"]',
        popover: {
            title: '🧠 Planos de Treino com IA',
            description: 'Gere planos completos em segundos usando a IA, ou crie manualmente sessão por sessão. Seus alunos recebem uma notificação quando o plano fica pronto.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: 'a[href*="/dashboard/subscription"]',
        popover: {
            title: '💳 Assinatura',
            description: 'Aqui ficam os detalhes do seu plano: limites de alunos, planos mensais e status de pagamento. Faça upgrade quando precisar de mais capacidade.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: 'a[href*="/dashboard/profile"]',
        popover: {
            title: '🪪 Seu Perfil Público',
            description: 'Sua página pública mostra suas especializações e histórico. Compartilhe o link com potenciais alunos para que te encontrem na plataforma.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: '[data-tour="notification-bell"]',
        popover: {
            title: '🔔 Notificações',
            description: 'Fique por dentro: aqui aparecem feedbacks de sessão dos seus alunos, conclusão de planos e muito mais — em tempo real, sem precisar recarregar a página.',
            side: 'top',
            align: 'end',
        },
    },
    {
        popover: {
            title: '🏆 Você está pronto(a)!',
            description: 'Explore à vontade. Dica de ouro: crie seu primeiro aluno e gere um plano com IA — o resultado vai te surpreender. Bora!',
            side: 'over',
            align: 'center',
        },
    },
]

const PARTNER_STEPS = [
    {
        popover: {
            title: '🤝 Bem-vindo(a), Parceiro(a)!',
            description: 'Você tem acesso ao Painel de Parceiro — uma suite completa para gerenciar seus alunos, ofertas e receita. Tour rápido em seguida!',
            side: 'over',
            align: 'center',
        },
    },
    {
        element: 'a[href*="/dashboard/students"]',
        popover: {
            title: '👥 Gestão de Alunos',
            description: 'Liste, convide e acompanhe todos os seus alunos. O vínculo acontece automaticamente quando eles aceitam o convite ou assinam uma das suas ofertas.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: 'a[href*="/dashboard/plans"]',
        popover: {
            title: '📋 Planos de Treino',
            description: 'Gere e entregue planos personalizados com IA. Quando você aprova ou entrega um plano, o aluno recebe uma notificação instantânea.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: 'a[href*="/dashboard/partner/offers"]',
        popover: {
            title: '🏷️ Assinaturas & Ofertas',
            description: 'Crie ofertas de acompanhamento (mensal, trimestral…) e gerencie as assinaturas ativas dos seus alunos. O Stripe cuida dos pagamentos automaticamente.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: 'a[href*="/dashboard/partner/revenue"]',
        popover: {
            title: '📊 Receita',
            description: 'Acompanhe sua receita bruta, comissões da plataforma e o saldo disponível para saque. Os repasses são feitos via Stripe Connect de forma automática.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: 'a[href*="/dashboard/partner/onboarding"]',
        popover: {
            title: '🔗 Configuração do Stripe',
            description: 'Para receber pagamentos, você precisa completar o onboarding do Stripe Connect. Acesse "Receita" e clique em "Configurar Recebimentos" para começar.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: '[data-tour="notification-bell"]',
        popover: {
            title: '🔔 Notificações',
            description: 'Receba alertas de feedback de alunos, conclusão de planos e novas assinaturas — tudo aqui no sino, sem precisar recarregar.',
            side: 'top',
            align: 'end',
        },
    },
    {
        popover: {
            title: '💼 Seu Negócio no Piloto Automático!',
            description: 'Crie sua primeira oferta e compartilhe o link de assinatura com seus alunos. O Stripe cuida da cobrança, você cuida do treino.',
            side: 'over',
            align: 'center',
        },
    },
]

const ATHLETE_STEPS = [
    {
        popover: {
            title: '⚡ Bem-vindo(a) ao Player.Action!',
            description: 'Aqui você recebe, acompanha e executa seus planos de treino. Vamos conhecer os principais recursos!',
            side: 'over',
            align: 'center',
        },
    },
    {
        element: 'a[href*="/dashboard/my-plan"]',
        popover: {
            title: '📅 Meu Plano Atual',
            description: 'Seu plano de treino ativo aparece aqui. Marque cada sessão como concluída e deixe um feedback para seu treinador — ele recebe uma notificação na hora.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: 'a[href*="/dashboard/plans"]',
        popover: {
            title: '📚 Histórico de Planos',
            description: 'Consulte todos os planos que já recebeu — aprovados, entregues e concluídos. Você também pode baixar qualquer plano em PDF.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: 'a[href*="/dashboard/billing"]',
        popover: {
            title: '💰 Faturamento',
            description: 'Aqui ficam suas assinaturas ativas com treinadores parceiros. Gerencie seus planos de pagamento diretamente pelo portal do Stripe.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: 'a[href*="/dashboard/profile"]',
        popover: {
            title: '🪪 Seu Perfil',
            description: 'Mantenha seus dados de posição e esporte atualizados. Seu treinador usa essas informações para gerar planos mais precisos para você.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: '[data-tour="notification-bell"]',
        popover: {
            title: '🔔 Notificações',
            description: 'Quando seu treinador aprovar ou entregar um novo plano, você recebe uma notificação aqui. Também aparecem convites de novos treinadores.',
            side: 'top',
            align: 'end',
        },
    },
    {
        popover: {
            title: '🏅 Bora Treinar!',
            description: 'Tudo pronto. Acesse "Meu Plano" e comece sua primeira sessão. Cada treino concluído eleva seu Rank de Ofensivas. Vamos nessa!',
            side: 'over',
            align: 'center',
        },
    },
]

// ─── Estilos customizados injetados via CSS-in-JS ─────────────────────────────
// Cores mapeadas para tokens do Tailwind — altere aqui para atualizar o tema do tour inteiro.
// Referência: https://tailwindcss.com/docs/customizing-colors
const TOUR_CSS = `
  /* ── Tailwind color tokens (CSS custom properties) ─────────────── */
  :root {
    --pa-slate-900: 15 23 42;   /* tw slate-900 */
    --pa-slate-800: 30 41 59;   /* tw slate-800 */
    --pa-slate-600: 71 85 105;  /* tw slate-600 */
    --pa-slate-400: 148 163 184;/* tw slate-400 */
    --pa-slate-100: 241 245 249;/* tw slate-100 */
    --pa-slate-50:  248 250 252;/* tw slate-50  */
    --pa-green-700: 21 128 61;  /* tw green-700 */
    --pa-green-600: 22 163 74;  /* tw green-600 */
    --pa-green-500: 34 197 94;  /* tw green-500 */
  }

  .driver-overlay { background: rgba(0,0,0,0.65) !important; }

  .driver-popover.driver-theme-pa {
    background: linear-gradient(135deg, rgb(var(--pa-slate-900)) 0%, rgb(var(--pa-slate-800)) 100%) !important;
    border: 1px solid rgba(var(--pa-green-500), 0.25) !important;
    border-radius: 16px !important;
    color: rgb(var(--pa-slate-100)) !important;
    box-shadow: 0 25px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(var(--pa-green-500), 0.1) !important;
    padding: 20px 24px 20px !important;
    max-width: 360px !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-title {
    font-size: 1.05rem !important;
    font-weight: 700 !important;
    color: rgb(var(--pa-slate-50)) !important;
    margin-bottom: 8px !important;
    line-height: 1.4 !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-description {
    font-size: 0.875rem !important;
    color: rgb(var(--pa-slate-400)) !important;
    line-height: 1.6 !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-footer {
    margin-top: 16px !important;
    border-top: 1px solid rgba(255,255,255,0.06) !important;
    padding-top: 12px !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-navigation-btns {
    display: flex !important;
    gap: 8px !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-prev-btn,
  .driver-popover.driver-theme-pa .driver-popover-next-btn,
  .driver-popover.driver-theme-pa .driver-popover-close-btn {
    border-radius: 8px !important;
    font-size: 0.8rem !important;
    font-weight: 600 !important;
    padding: 6px 14px !important;
    border: none !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-prev-btn {
    background: rgba(255,255,255,0.08) !important;
    color: rgb(var(--pa-slate-400)) !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-prev-btn:hover {
    background: rgba(255,255,255,0.15) !important;
    color: rgb(var(--pa-slate-100)) !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-next-btn {
    background: linear-gradient(135deg, rgb(var(--pa-green-600)), rgb(var(--pa-green-500))) !important;
    color: white !important;
    box-shadow: 0 2px 8px rgba(var(--pa-green-500), 0.35) !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-next-btn:hover {
    background: linear-gradient(135deg, rgb(var(--pa-green-700)), rgb(var(--pa-green-600))) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 12px rgba(var(--pa-green-500), 0.45) !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-close-btn {
    background: transparent !important;
    color: rgb(var(--pa-slate-600)) !important;
    font-size: 1rem !important;
    padding: 4px 8px !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-close-btn:hover {
    color: rgb(var(--pa-slate-400)) !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-progress-text {
    color: rgb(var(--pa-green-500)) !important;
    font-size: 0.75rem !important;
    font-weight: 600 !important;
  }

  .driver-popover.driver-theme-pa .driver-popover-arrow-side-left { border-left-color: rgb(var(--pa-slate-800)) !important; }
  .driver-popover.driver-theme-pa .driver-popover-arrow-side-right { border-right-color: rgb(var(--pa-slate-800)) !important; }
  .driver-popover.driver-theme-pa .driver-popover-arrow-side-top { border-top-color: rgb(var(--pa-slate-800)) !important; }
  .driver-popover.driver-theme-pa .driver-popover-arrow-side-bottom { border-bottom-color: rgb(var(--pa-slate-800)) !important; }
`

// ─── Componente ───────────────────────────────────────────────────────────────
export function PlatformTour() {
    const { data: session, status } = useSession()
    const pathname = usePathname()

    useEffect(() => {
        const isDashboardHome = pathname.endsWith('/dashboard')
        if (!isDashboardHome || status !== 'authenticated' || !session?.user) return

        const roles = session.user.roles || []
        const systemRoles = session.user.systemRoles || []

        // Apenas não mostra para PENDING (usuário que ainda não escolheu role)
        const isPending = roles.includes(ROLES.PENDING) || roles.length === 0
        if (isPending) return

        // Flag única por userId — outro usuário no mesmo device vê o tour
        const tourKey = `hasSeenTour_${session.user.id}`
        if (localStorage.getItem(tourKey)) return

        // Determina qual tour exibir — PARTNER tem prioridade sobre TRAINER
        const isPartner = roles.includes(ROLES.PARTNER) || systemRoles.includes('PARTNER')
        const isTrainer = roles.includes(ROLES.PROFESSIONAL)

        let steps
        if (isPartner) {
            steps = PARTNER_STEPS.filter(s => {
                // Remove step de onboarding se Stripe já estiver configurado
                if (s.element?.includes('onboarding')) {
                    const hasStripe = session.user.stripeAccountStatus === 'active'
                    return !hasStripe
                }
                return true
            })
        } else if (isTrainer) {
            steps = TRAINER_STEPS
        } else {
            steps = ATHLETE_STEPS
        }

        const timer = setTimeout(() => {
            // Inject CSS once
            if (!document.getElementById('pa-tour-styles')) {
                const style = document.createElement('style')
                style.id = 'pa-tour-styles'
                style.textContent = TOUR_CSS
                document.head.appendChild(style)
            }

            const driverObj = driver({
                showProgress: true,
                nextBtnText: 'Próximo →',
                prevBtnText: '← Voltar',
                doneBtnText: 'Vamos lá! 🚀',
                allowClose: true,
                popoverClass: 'driver-theme-pa',
                stagePadding: 6,
                stageRadius: 8,
                steps,
                onDestroyStarted: () => {
                    // Se ainda tem próximo step, confirma antes de fechar
                    if (driverObj.hasNextStep()) {
                        if (confirm('Pular o tour? Você pode reiniciá-lo nas configurações.')) {
                            driverObj.destroy()
                            localStorage.setItem(tourKey, 'true')
                        }
                    } else {
                        driverObj.destroy()
                        localStorage.setItem(tourKey, 'true')
                    }
                },
            })

            driverObj.drive()
        }, 2500) // Aguarda hydration + layout shifts + JWT atualizar após onboarding

        return () => clearTimeout(timer)
    }, [status, session, pathname])

    return null
}
