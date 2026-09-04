import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Hub de Entrada do Frontend 3D
 * Ao invés do frontend 3D tentar lidar com OAuth Popup e Cookies, ele simplesmente
 * faz um href hard para cá.
 * 
 * Se estiver logado: Mandamos para a sync-route que empacota o token.
 * Se NÃO estiver: Redirecionamos para o SignIn do provedor Google garantindo que, quando ele terminar,
 * vai cair na /api/auth/3d-sync
 */
export default async function Sync3DLoginPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    // Força o login via next-auth apontando o callback para o gerador de JWT
    // Se quiser exibir uma UI customizada de login aqui com um botão "Entrar com Google", 
    // basta retornar um ( <div>...</div> ) e chamar signIn('google', { callbackUrl: '/api/auth/3d-sync' })
    redirect('/api/auth/signin/google?callbackUrl=/api/auth/3d-sync')
  } else {
    // Se já estiver logado, não tem porquê ver tela: bounce pra sync
    redirect('/api/auth/3d-sync')
  }
}
