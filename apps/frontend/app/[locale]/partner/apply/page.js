'use client'

import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Zap, CheckCircle, ArrowRight, Loader2, Users, TrendingUp, Shield } from 'lucide-react'
import TermsCheckbox from '@/components/terms-checkbox'

const BENEFITS = [
  { icon: Users,       title: 'Seus alunos, seu preço',    desc: 'Você define o valor que cobra de cada aluno. A plataforma cuida da cobrança automática.' },
  { icon: TrendingUp,  title: 'Renda recorrente',           desc: 'Mensalidades recorrentes sem esforço. Você treina, a plataforma cobra.' },
  { icon: Shield,      title: 'Infraestrutura completa',    desc: 'Dashboard, treinos com IA, biblioteca de vídeos, chat e agendamentos — tudo incluso.' },
]

export default function PartnerApplyPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [applying, setApplying]   = useState(false)
  const [done, setDone]           = useState(false)
  const [error, setError]         = useState('')
  const [phone, setPhone]         = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      signIn('google', { callbackUrl: '/partner/apply' })
    }
    if (status === 'authenticated') {
      fetch('/api/backend/user/profile')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.phone) setPhone(d.phone) })
        .catch(() => {})
        .finally(() => setLoadingProfile(false))
    }
  }, [status])

  const handleApply = async () => {
    if (!termsAccepted) return
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 11) {
      setError('Informe seu telefone/WhatsApp com DDD antes de continuar.')
      return
    }
    setApplying(true)
    setError('')
    try {
      // Salva o telefone no perfil antes de aplicar
      await fetch('/api/backend/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      })

      const res  = await fetch('/api/backend/partner/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (!res.ok) {
        // Já é parceiro → redireciona para dashboard
        if (res.status === 400 && data.error?.includes('candidatura')) {
          router.push('/dashboard')
          return
        }
        throw new Error(data.error || 'Erro ao processar candidatura')
      }
      setDone(true)
      setTimeout(() => router.push('/dashboard'), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setApplying(false)
    }
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[#0a0c12] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#39ff6a]" />
      </div>
    )
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;700;900&family=Inter:wght@400;500;600&display=swap');
        .fd { font-family: 'Barlow', sans-serif; }
      `}</style>

      <div className="min-h-screen bg-[#0a0c12] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>

        {/* Navbar mínima */}
        <header className="border-b border-[#161e2e] px-6 h-16 flex items-center">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-[#39ff6a] rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-black" strokeWidth={2.5} />
            </div>
            <span className="fd font-black text-lg tracking-tight">
              <span className="text-white">PLAY</span>{' '}
              <span className="text-[#39ff6a]">ACTION</span>
            </span>
          </button>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-20">

          {done ? (
            /* ── Sucesso ── */
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-[#39ff6a]/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#39ff6a]/30">
                <CheckCircle className="w-10 h-10 text-[#39ff6a]" />
              </div>
              <h1 className="fd font-black text-5xl uppercase mb-4">
                Bem-vindo ao <span className="text-[#39ff6a]">programa!</span>
              </h1>
              <p className="text-gray-400 text-lg mb-3">
                Sua conta de parceiro foi ativada com sucesso.
              </p>
              <p className="text-gray-500 text-sm">Redirecionando para o dashboard...</p>
              <Loader2 className="w-5 h-5 animate-spin text-[#39ff6a] mx-auto mt-6" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-16 items-start">

              {/* Lado esquerdo — copy */}
              <div>
                <p className="text-xs font-bold text-[#39ff6a] uppercase tracking-widest mb-4">PROGRAMA DE PARCEIROS</p>
                <h1 className="fd font-black text-5xl md:text-6xl uppercase leading-tight mb-6">
                  Escale seu negócio com a <span className="text-[#39ff6a]">Play Action</span>
                </h1>
                <p className="text-gray-400 text-lg leading-relaxed mb-10">
                  Você define o preço que cobra dos seus alunos. A Play Action desconta automaticamente a taxa da plataforma e o restante vai direto para você — sem burocracia, sem planilha, sem WhatsApp.
                </p>

                <div className="space-y-6">
                  {BENEFITS.map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="flex gap-4">
                      <div className="w-10 h-10 bg-[#39ff6a]/10 rounded-xl flex items-center justify-center shrink-0 border border-[#39ff6a]/20">
                        <Icon className="w-5 h-5 text-[#39ff6a]" />
                      </div>
                      <div>
                        <p className="font-semibold text-white mb-1">{title}</p>
                        <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lado direito — card de ação */}
              <div className="bg-[#0f1520] border border-[#1a2235] rounded-2xl p-8 sticky top-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-sm font-bold">
                    {session?.user?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{session?.user?.name}</p>
                    <p className="text-gray-500 text-xs">{session?.user?.email}</p>
                  </div>
                </div>

                <div className="border-t border-[#1a2235] pt-6 mb-6">
                  <h2 className="fd font-black text-2xl uppercase mb-2">Entrar como parceiro</h2>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Ao confirmar, você ingressa no programa de parceiros e tem acesso imediato a todas as ferramentas da plataforma.
                  </p>
                </div>

                {/* Campo de telefone — obrigatório */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">
                    Telefone / WhatsApp <span className="text-[#39ff6a]">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError('') }}
                    maxLength={16}
                    className="w-full bg-[#0a0c12] border border-[#2a3348] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#39ff6a]/60 transition-colors"
                  />
                  <p className="text-xs text-gray-600 mt-1.5">Precisamos do seu número para entrar em contato sobre sua conta.</p>
                </div>

                <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} variant="partner" className="mt-4" />

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleApply}
                  disabled={applying || !termsAccepted}
                  className="w-full bg-[#39ff6a] text-black font-bold py-4 rounded-xl hover:bg-[#2ee05e] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {applying ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Ativando conta...</>
                  ) : (
                    <>Confirmar e entrar no programa <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <p className="text-center text-xs text-gray-500 mt-4">
                  Sem mensalidade. A taxa é descontada apenas sobre o que você recebe.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
