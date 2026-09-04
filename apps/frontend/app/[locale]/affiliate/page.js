'use client'

import { useSession, signIn } from 'next-auth/react'
import { useState } from 'react'
import { ArrowRight, Link, Percent, Users, TrendingUp } from 'lucide-react'
import TermsCheckbox from '@/components/terms-checkbox'

export default function AffiliatePage() {
  const { data: session } = useSession()
  const [termsAccepted, setTermsAccepted] = useState(false)

  return (
    <div className="min-h-screen bg-[#070a10] text-white">
      <div className="max-w-4xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f472b6] border border-[#f472b6]/30 bg-[#f472b6]/5 px-3 py-1.5 rounded-full mb-5">
            <Percent className="w-3.5 h-3.5" />
            PROGRAMA DE AFILIADOS
          </span>
          <h1 className="fd font-black text-4xl md:text-6xl leading-tight mb-4">
            Ganhe comissão indicando<br />
            <span className="text-[#f472b6]">treinadores</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed">
            Indique treinadores e parceiros para a Player.Action e ganhe uma comissão recorrente sobre as assinaturas dos alunos deles.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="bg-[#0c1018] border border-[#1e2535] rounded-2xl p-8 text-center hover:border-[#f472b6]/30 transition-colors">
            <div className="w-12 h-12 bg-[#f472b6]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Link className="w-5 h-5 text-[#f472b6]" />
            </div>
            <h3 className="font-bold text-white mb-2">1. Compartilhe seu link</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Você recebe um link único de indicação. Compartilhe com treinadores e parceiros.
            </p>
          </div>

          <div className="bg-[#0c1018] border border-[#1e2535] rounded-2xl p-8 text-center hover:border-[#f472b6]/30 transition-colors">
            <div className="w-12 h-12 bg-[#f472b6]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-5 h-5 text-[#f472b6]" />
            </div>
            <h3 className="font-bold text-white mb-2">2. Eles se cadastram</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Quando um treinador se cadastra pelo seu link, a indicação é registrada automaticamente.
            </p>
          </div>

          <div className="bg-[#0c1018] border border-[#1e2535] rounded-2xl p-8 text-center hover:border-[#f472b6]/30 transition-colors">
            <div className="w-12 h-12 bg-[#f472b6]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-5 h-5 text-[#f472b6]" />
            </div>
            <h3 className="font-bold text-white mb-2">3. Você ganha comissão</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              A cada mensalidade paga pelos alunos deles, você recebe uma comissão recorrente.
            </p>
          </div>
        </div>

        <div className="bg-[#0c1018] border border-[#1e2535] rounded-2xl p-8 max-w-2xl mx-auto text-center">
          <h2 className="font-bold text-xl text-white mb-4">Quero ser afiliado</h2>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">
            {session
              ? 'Você já está logado! Acesse seu dashboard de afiliado para começar.'
              : 'Crie sua conta em segundos com o Google e comece a indicar.'}
          </p>
          <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} variant="affiliate" className="mb-6" />
          <button
            onClick={() => session
              ? window.location.href = '/dashboard/affiliate'
              : signIn('google', { callbackUrl: '/dashboard/affiliate' })
            }
            disabled={!termsAccepted}
            className="bg-[#f472b6] text-white font-bold px-8 py-4 rounded-xl hover:bg-[#e062a0] transition-all hover:scale-105 active:scale-95 inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {session ? 'Ir para Dashboard' : 'Entrar com Google'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
