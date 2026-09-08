import { redirect } from 'next/navigation'

/**
 * /dashboard/partner não tem conteúdo próprio.
 * Redireciona para a página principal do parceiro: offers.
 */
export default function PartnerDashboardPage() {
  redirect('/dashboard/partner/offers')
}
