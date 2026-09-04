'use client'

import { ROLES } from '@/lib/constants'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  Zap, Bot, Video, BarChart2, ClipboardList, Calendar,
  MessageSquare, CreditCard, CheckSquare, ArrowRight,
  Loader2, Check, Smartphone, FileText, Clock, Ban,
  GraduationCap, Dumbbell, Briefcase, Link as LinkIcon, LogIn,
} from 'lucide-react'
import { toast } from 'sonner'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { RoleCard } from '@/components/ui/role-card'

// ─── Dados estáticos ───────────────────────────────────────────────────────────

const PAIN_POINTS = [
  {
    icon: Smartphone,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    title: 'Tudo jogado no WhatsApp pessoal',
    desc: 'Treino enviado no zap se perde em meio a outras mensagens. O aluno não acha, você manda de novo — vira rotina.',
  },
  {
    icon: FileText,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    title: 'Informações espalhadas, sem ficha do aluno',
    desc: 'Você sabe quem está treinando, mas não tem como registrar a evolução. Sem histórico, sem dados, sem como mostrar o progresso.',
  },
  {
    icon: Clock,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    title: 'Criar treino leva tempo demais',
    desc: 'Você monta tudo de zero para cada aluno, sem apoio, sem padrão. Horas que poderiam ser usadas em quadra — ou com a família.',
  },
  {
    icon: Ban,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    title: 'Preso ao presencial, sem como crescer',
    desc: 'Sua renda depende do espaço físico. Se você não está lá, não fatura. Não dá para escalar assim.',
  },
]

const SOLUTION_ITEMS = [
  'Ficha completa de cada aluno em um só lugar',
  'Evolução registrada e visível para o aluno e os pais',
  'Treinos organizados com vídeos dos exercícios',
  'Aluno marca o treino concluído — você acompanha tudo',
  'Agenda, chat e avisos — tudo dentro da plataforma',
  'Cobrança automática todo mês, sem precisar cobrar',
  'Atenda alunos online de qualquer cidade',
]

const FEATURES = [
  {
    icon: Bot,
    title: 'IA como Assistente do Professor',
    desc: 'A inteligência artificial está aqui para economizar o seu tempo, não para substituir o seu trabalho. Ela ajuda você a estruturar planos de 30 dias — mas quem monta, revisa e decide cada exercício é você.',
    badge: '★ Exclusivo Play Action',
    large: true,
  },
  { icon: Video, title: 'Biblioteca de Vídeos', desc: 'Faça upload dos seus próprios vídeos ensinando os exercícios. O sistema vincula automaticamente ao treino criado.' },
  { icon: BarChart2, title: 'Dashboard de Evolução', desc: 'Acompanhe adesão, constância e progresso real de cada aluno. Visualize quem está treinando e quem precisa de atenção.' },
  { icon: ClipboardList, title: 'Ficha Completa do Aluno', desc: 'Histórico, dados físicos, objetivos e documentação centralizada. Nada se perde, tudo é acessível a qualquer hora.' },
  { icon: Calendar, title: 'Agenda Integrada', desc: 'O aluno agenda aulas ou consultorias direto no próprio dashboard. Sem idas e vindas no WhatsApp.' },
  { icon: MessageSquare, title: 'Chat & Notificações', desc: 'Comunicação profissional dentro da plataforma. Envie avisos, receba dúvidas e mantenha tudo organizado.' },
  { icon: CreditCard, title: 'Pagamento Automático', desc: 'Cobrança recorrente automatizada. Você vende o plano, a plataforma cuida do resto. Receba todo mês sem esforço.' },
  { icon: CheckSquare, title: 'Checklist de Treinos', desc: 'O aluno marca os treinos concluídos. Você vê em tempo real quem está seguindo o plano.' },
]

const SPORTS = [
  { name: 'Futebol', emoji: '⚽' }, { name: 'Futsal', emoji: '🏟️' },
  { name: 'Vôlei', emoji: '🏐' }, { name: 'Natação', emoji: '🏊' },
  { name: 'Beach Tênis', emoji: '🎾' }, { name: 'Futevôlei', emoji: '🏖️' },
  { name: 'Padel', emoji: '🏸' }, { name: 'Ciclismo', emoji: '🚴' },
  { name: 'Corrida', emoji: '🏃' }, { name: 'Polo Aquático', emoji: '🤽' },
  { name: 'Boxe', emoji: '🥊' },
]

const STUDENTS = [
  { initials: 'LM', name: 'Lucas Medeiros', progress: 78, status: 'Em dia', bg: 'bg-green-700' },
  { initials: 'AS', name: 'Ana Silva', progress: 42, status: 'Atenção', bg: 'bg-orange-600' },
  { initials: 'RF', name: 'Rafael Fontes', progress: 95, status: 'Em dia', bg: 'bg-blue-700' },
]

// ─── Componente principal ──────────────────────────────────────────────────────

export default function LandingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loadingPlan, setLoadingPlan] = useState(null)
  const [tiers, setTiers] = useState([])
  const [loadingTiers, setLoadingTiers] = useState(true)
  const [selectedRole, setSelectedRole] = useState(ROLES.PROFESSIONAL)
  const [modules, setModules] = useState({
    moduleCoachEnabled:      false,
    moduleAthleteEnabled:    false,
    modulePartnerB2BEnabled: true,
    moduleAffiliateEnabled:  true,
  })

  useEffect(() => {
    fetch('/api/backend/public/partner-tiers')
      .then(r => r.ok ? r.json() : { tiers: [] })
      .then(d => setTiers(d.tiers || []))
      .catch(console.error)
      .finally(() => setLoadingTiers(false))
    // Busca flags de módulos para renderizar RoleCards condicionalmente
    fetch('/api/backend/public/modules')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setModules(d) })
      .catch(() => {}) // falha silenciosa — usa os defaults
  }, [])

  const handleCTA = () =>
    status === 'authenticated'
      ? router.push('/dashboard')
      : signIn('google', { callbackUrl: '/dashboard' })

  const handleSubscribe = async (planSlug) => {
    if (!session) { signIn('google', { callbackUrl: '/dashboard' }); return }
    // Para PartnerTier: redireciona para o fluxo de candidatura ao programa de parceiros
    router.push('/partner/apply')
  }

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  const activeTiers = tiers

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&family=Inter:wght@400;500;600&display=swap');
        .fd { font-family: 'Barlow', sans-serif; }
      `}</style>

      <div className="min-h-screen bg-[#0a0c12] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>

        {/* ── NAVBAR ──────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-50 bg-[#0a0c12]/95 backdrop-blur-md border-b border-[#161e2e]">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-[#39ff6a] rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-black" strokeWidth={2.5} />
              </div>
              <span className="fd font-black text-xl tracking-tight">
                <span className="text-white">PLAY</span>{' '}
                <span className="text-[#39ff6a]">ACTION</span>
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-8">
              {[
                { label: 'Funcionalidades', id: 'funcionalidades' },
                { label: 'Modalidades', id: 'modalidades' },
                { label: 'Como funciona', id: 'como-funciona' },
                { label: 'Planos', id: 'planos' },
              ].map(({ label, id }) => (
                <button key={id} onClick={() => scrollTo(id)}
                  className="text-sm text-gray-400 hover:text-white transition-colors bg-transparent border-0 cursor-pointer">
                  {label}
                </button>
              ))}
              {status !== 'authenticated' && (
                <button onClick={() => scrollTo('acesso-rapido')}
                  className="text-sm text-[#39ff6a] hover:text-[#2ee05e] font-semibold transition-colors bg-transparent border-0 cursor-pointer">
                  Entrar
                </button>
              )}
            </nav>

            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <button onClick={handleCTA}
                className="bg-[#39ff6a] text-black text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-[#2ee05e] transition-colors">
                {status === 'authenticated' ? 'Ir para Dashboard' : 'Cadastrar agora'}
              </button>
            </div>
          </div>
        </header>

        {/* ── HERO ────────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-6 pt-20 pb-16 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#39ff6a] border border-[#39ff6a]/30 bg-[#39ff6a]/5 px-3 py-1.5 rounded-full mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-[#39ff6a] animate-pulse" />
              PLATAFORMA PARA TREINADORES
            </span>

            <h1 className="fd font-black text-6xl md:text-7xl xl:text-8xl leading-none uppercase tracking-tight mb-6">
              VENDA SUAS AULAS<br />
              OFEREÇA CONSULTORIA ONLINE<br />
              {/* SEU TEMPO<br />
              NÃO ESCALA.<br />
              SEU MÉTODO<br /> */}
              <span className="text-[#39ff6a]">EM UM ÚNICO LUGAR</span>
            </h1>

            <p className="text-gray-400 text-lg leading-relaxed mb-8 max-w-md">
              Crie assinaturas mensais de treinos com vídeos e acompanhamento. Agenda integrada, chat interno e pagamentos automáticos.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <button onClick={handleCTA}
                className="bg-[#39ff6a] text-black font-bold px-7 py-3.5 rounded-xl hover:bg-[#2ee05e] transition-all hover:scale-105 active:scale-95">
                Quero escalar agora
              </button>
              <button onClick={() => scrollTo('funcionalidades')}
                className="text-white font-medium flex items-center gap-1.5 hover:text-[#39ff6a] transition-colors bg-transparent border-0 cursor-pointer">
                Ver funcionalidades <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Dashboard mockup */}
          <div className="hidden lg:block">
            <div className="bg-[#131924] rounded-2xl border border-[#1e2535] p-5 shadow-2xl shadow-black/60">
              <div className="flex items-center gap-1.5 mb-5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-[#39ff6a]" />
                <span className="text-xs text-gray-500 ml-2">Dashboard — Meus Alunos</span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'ALUNOS ATIVOS', value: '47', color: 'text-white' },
                  { label: 'TREINOS ENVIADOS', value: '138', color: 'text-white' },
                  { label: 'TAXA DE ADESÃO', value: '84%', color: 'text-red-400' },
                ].map(m => (
                  <div key={m.label} className="bg-[#0a0c12] rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">{m.label}</p>
                    <p className={`fd font-black text-3xl mt-1 ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-0.5">
                {STUDENTS.map(s => (
                  <div key={s.initials} className="flex items-center gap-3 py-2.5 border-b border-[#1e2535] last:border-0">
                    <div className={`${s.bg} w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0`}>
                      {s.initials}
                    </div>
                    <span className="text-sm text-white flex-1 truncate">{s.name}</span>
                    <div className="w-20 h-1.5 bg-[#1a2235] rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-[#39ff6a] rounded-full" style={{ width: `${s.progress}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400 w-20 shrink-0">{s.progress}% concluído</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 ${s.status === 'Em dia' ? 'bg-green-900/60 text-green-400' : 'bg-orange-900/60 text-orange-400'}`}>
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 p-3 bg-[#0f1520] rounded-xl border border-[#1e3320]">
                <p className="text-xs text-gray-400">
                  IA sugeriu ajuste no ciclo de Lucas —{' '}
                  <span className="text-[#39ff6a] font-medium">você decide se aplica</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── STATS ───────────────────────────────────────────────────────── */}
        <div className="border-y border-[#161e2e] bg-[#0c1018]">
          <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '+500', label: 'Alunos por professor' },
              { value: '10X', label: 'Mais rápido montar treinos' },
              { value: '0', label: 'Treino perdido no zap' },
              { value: '100%', label: 'Presencial + online' },
            ].map(s => (
              <div key={s.label}>
                <p className="fd font-black text-4xl text-[#39ff6a]">{s.value}</p>
                <p className="text-sm text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── ACESSO RÁPIDO ────────────────────────────────────────────── */}
        <section id="acesso-rapido" className="max-w-7xl mx-auto px-6 pb-16 pt-4">
          <div className="relative rounded-3xl border border-[#1e2535] bg-gradient-to-br from-[#0c1018] via-[#0f1520] to-[#0a0c12] p-8 md:p-12 overflow-hidden">
            {/* Glow decorativo */}
            <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-[#39ff6a]/5 blur-3xl" />

            <div className="relative z-10 text-center mb-10">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#39ff6a] border border-[#39ff6a]/30 bg-[#39ff6a]/5 px-3 py-1.5 rounded-full mb-5">
                <LogIn className="w-3.5 h-3.5" />
                ACESSO RÁPIDO
              </span>
              <h2 className="fd font-black text-3xl md:text-5xl leading-tight">
                Já tem conta?{' '}
                <span className="text-[#39ff6a]">Entre direto.</span>
              </h2>
              <p className="text-gray-400 mt-3 text-base max-w-md mx-auto">
                Selecione seu perfil abaixo e acesse a plataforma em segundos.
              </p>
            </div>

            <div className="relative z-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">

              {modules.moduleCoachEnabled && (
                <RoleCard
                  icon={Dumbbell}
                  role="PROFESSIONAL"
                  title="Sou Professor"
                  description="Gerencie alunos, crie planos de treino e acompanhe a evolução."
                  onClick={() => signIn('google', { callbackUrl: `/api/auth/callback/quick-role?role=${ROLES.PROFESSIONAL}` })}
                />
              )}

              {modules.modulePartnerB2BEnabled && (
                <RoleCard
                  icon={GraduationCap}
                  role="CLIENT"
                  title="Sou Aluno"
                  description="Veja seus treinos, acompanhe seu progresso e marque sessões."
                  onClick={() => signIn('google', { callbackUrl: `/api/auth/callback/quick-role?role=${ROLES.CLIENT}` })}
                />
              )}

              {modules.modulePartnerB2BEnabled && (
                <RoleCard
                  icon={Briefcase}
                  role="PARTNER"
                  title="Sou Parceiro"
                  description="Crie ofertas, gerencie assinantes e acompanhe seu faturamento."
                  onClick={() => signIn('google', { callbackUrl: `/api/auth/callback/quick-role?role=${ROLES.PARTNER}` })}
                />
              )}

              {modules.moduleAffiliateEnabled && (
                <RoleCard
                  icon={LinkIcon}
                  role="AFFILIATE"
                  title="Sou Afiliado"
                  description="Indique parceiros e ganhe comissão sobre assinaturas."
                  onClick={() => signIn('google', { callbackUrl: `/api/auth/callback/quick-role?role=${ROLES.AFFILIATE}` })}
                />
              )}

              {/* Nenhum módulo ativo */}
              {!modules.moduleCoachEnabled &&
               !modules.modulePartnerB2BEnabled &&
               !modules.moduleAffiliateEnabled && (
                <div className="col-span-4 text-center py-8">
                  <p className="text-gray-400 text-sm">A plataforma estará disponível em breve.</p>
                </div>
              )}

            </div>

            <p className="relative z-10 text-center text-xs text-gray-600 mt-8">
              Primeiro acesso? Use o botão{' '}
              <button
                onClick={handleCTA}
                className="text-[#39ff6a] underline underline-offset-2 bg-transparent border-0 cursor-pointer text-xs"
              >
                Cadastrar agora
              </button>
              {' '}no topo da página.
            </p>
          </div>
        </section>

        {/* ── PROBLEMA + SOLUÇÃO ──────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-6 py-24">
          <p className="text-xs font-bold text-[#39ff6a] uppercase tracking-widest mb-4">
            A REALIDADE DE TODO PROFESSOR
          </p>
          <h2 className="fd font-black text-4xl md:text-6xl leading-tight mb-6">
            Você consegue atender<br />
            até <span className="text-[#39ff6a]">40 alunos</span> — e depois?
          </h2>
          <p className="text-gray-400 text-lg max-w-xl mb-16 leading-relaxed">
            Um professor consegue dar aulas de qualidade para 10, 20, talvez 40 alunos. Passando disso, não sobra tempo para a família, os alunos ficam sem atenção e os pais começam a questionar:{' '}
            <em className="text-white">"Meu filho está evoluindo mesmo?"</em> — e você não tem como provar.
          </p>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Pain cards */}
            <div className="space-y-4">
              {PAIN_POINTS.map(p => {
                const Icon = p.icon
                return (
                  <div key={p.title} className="bg-[#0c1018] border border-[#1e2535] rounded-2xl p-5 hover:border-[#253050] transition-colors">
                    <div className="flex items-start gap-4">
                      <div className={`${p.bg} p-2.5 rounded-xl shrink-0`}>
                        <Icon className={`w-5 h-5 ${p.color}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-white mb-1">{p.title}</p>
                        <p className="text-sm text-gray-400 leading-relaxed">{p.desc}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Solution card */}
            <div className="bg-[#0f1520] border border-[#2a4030] rounded-2xl p-8">
              <h3 className="fd font-black text-2xl md:text-3xl mb-3">
                A Play Action resolve tudo isso.
              </h3>
              <p className="text-gray-400 mb-8 leading-relaxed">
                Uma plataforma feita para o professor de esporte que quer atender mais alunos, com mais qualidade — e ainda ter tempo para viver sua vida fora das quadras.
              </p>
              <ul className="space-y-3">
                {SOLUTION_ITEMS.map(item => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <Check className="w-4 h-4 text-[#39ff6a] mt-0.5 shrink-0" />
                    <span className="text-gray-300">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── FEATURES ────────────────────────────────────────────────────── */}
        <section id="funcionalidades" className="max-w-7xl mx-auto px-6 py-24">
          <p className="text-xs font-bold text-[#39ff6a] uppercase tracking-widest mb-4">FUNCIONALIDADES</p>
          <h2 className="fd font-black text-4xl md:text-6xl leading-tight mb-4">
            Tudo que você precisa<br />
            para <span className="text-[#39ff6a]">escalar</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-lg mb-16 leading-relaxed">
            Ferramentas pensadas para <span className="text-white">profissionais</span> do esporte que querem crescer com{' '}
            <span className="text-[#39ff6a]">qualidade</span> e <span className="text-[#39ff6a]">controle</span>.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Large card */}
            <div className="md:col-span-2 bg-[#0c1018] border border-[#1e2535] rounded-2xl p-7 hover:border-[#39ff6a]/30 transition-colors">
              <div className="w-10 h-10 bg-[#39ff6a]/10 rounded-xl flex items-center justify-center mb-4">
                <Bot className="w-5 h-5 text-[#39ff6a]" />
              </div>
              <h3 className="font-semibold text-xl text-white mb-2">{FEATURES[0].title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-5">{FEATURES[0].desc}</p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#39ff6a] border border-[#39ff6a]/30 bg-[#39ff6a]/10 px-3 py-1.5 rounded-full">
                {FEATURES[0].badge}
              </span>
            </div>

            {/* Regular cards */}
            {FEATURES.slice(1).map(f => {
              const Icon = f.icon
              return (
                <div key={f.title} className="bg-[#0c1018] border border-[#1e2535] rounded-2xl p-6 hover:border-[#39ff6a]/30 transition-colors">
                  <div className="w-9 h-9 bg-[#39ff6a]/10 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="w-4 h-4 text-[#39ff6a]" />
                  </div>
                  <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── MODALIDADES ─────────────────────────────────────────────────── */}
        <section id="modalidades" className="max-w-7xl mx-auto px-6 py-24">
          <p className="text-xs font-bold text-[#39ff6a] uppercase tracking-widest mb-4">MODALIDADES</p>
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="fd font-black text-4xl md:text-6xl leading-tight mb-4">
                Funciona para<br />
                o seu <span className="text-[#39ff6a]">esporte</span>
              </h2>
              <p className="text-gray-400 text-lg leading-relaxed">
                Seja qual for a modalidade, a Play Action se adapta ao seu método de trabalho.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-start pt-2">
              {SPORTS.map(s => (
                <span key={s.name} className="flex items-center gap-2 bg-[#0c1018] border border-[#1e2535] px-4 py-2.5 rounded-full text-sm text-white hover:border-[#39ff6a]/50 hover:text-[#39ff6a] transition-colors cursor-default">
                  <span>{s.emoji}</span>{s.name}
                </span>
              ))}
              <span className="flex items-center gap-2 bg-[#0c1018] border border-[#1e2535] px-4 py-2.5 rounded-full text-sm text-gray-400 cursor-default">
                <span className="font-bold text-[#39ff6a]">+ mais</span> Outras modalidades
              </span>
            </div>
          </div>
        </section>

        {/* ── COMO FUNCIONA ───────────────────────────────────────────────── */}
        <section id="como-funciona" className="py-24 max-w-7xl mx-auto px-6">
          <p className="text-xs font-bold text-[#39ff6a] uppercase tracking-widest mb-4">
            COMO FUNCIONA
          </p>
          <h2 className="fd font-black text-5xl md:text-7xl uppercase leading-tight mb-20">
            Do cadastro ao<br />
            <span className="text-[#39ff6a]">primeiro aluno</span>
          </h2>

          <div className="relative">
            {/* Linha conectora (visível apenas em telas médias/grandes) */}
            <div className="hidden md:block absolute top-[23px] left-[12%] right-[12%] h-[1px] bg-[#131924] z-0" />

            <div className="grid md:grid-cols-4 gap-8 relative z-10">
              {[
                { step: '1', title: 'Cadastre-se na plataforma', desc: 'Crie sua conta em poucos minutos e configure seu perfil como profissional do esporte.' },
                { step: '2', title: 'Monte sua biblioteca', desc: 'Faça upload dos seus vídeos e configure os exercícios da sua metodologia.' },
                { step: '3', title: 'Monte os planos de treino', desc: 'Use a IA como assistente para estruturar seus treinos de 30 dias. Você revisa, ajusta e envia com os vídeos dos exercícios.' },
                { step: '4', title: 'Escale e receba', desc: 'Atenda online e presencial, acompanhe evolução e receba de forma recorrente automaticamente.' },
              ].map(s => (
                <div key={s.step} className="text-center">
                  <div className="w-12 h-12 bg-[#0a0c12] border border-[#161e2e] hover:border-[#39ff6a]/50 transition-colors rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="font-bold text-[#39ff6a] text-lg">{s.step}</span>
                  </div>
                  <h3 className="font-semibold text-lg text-white mb-3">{s.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PLANOS ──────────────────────────────────────────────────────── */}
        <section id="planos" className="max-w-7xl mx-auto px-6 py-24">
          <p className="text-xs font-bold text-[#39ff6a] uppercase tracking-widest mb-4">PLANOS</p>
          <h2 className="fd font-black text-5xl md:text-7xl uppercase leading-tight mb-6">
            Você define o preço.<br />
            A plataforma cuida do <span className="text-[#39ff6a]">resto.</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mb-16 leading-relaxed">
            Você cria seu plano, define o valor da mensalidade e a Play Action desconta automaticamente a taxa da plataforma. O restante vai direto para você — sem burocracia.
          </p>

          {loadingTiers ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#39ff6a]" />
            </div>
          ) : activeTiers.length === 0 ? (
            <p className="text-gray-500 py-12">Nenhum plano configurado para treinadores no momento.</p>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              {activeTiers.map((plan, idx) => {
                // Destacar o tier do meio (índice 1) como popular se tiver 3+
                const isHighlighted = activeTiers.length >= 2 && idx === Math.floor(activeTiers.length / 2)
                // Construir features a partir dos campos do PartnerTier
                const features = [
                  plan.maxAthletes ? `Até ${plan.maxAthletes} alunos ativos` : 'Alunos ilimitados',
                  plan.maxPlansPerMonth ? `${plan.maxPlansPerMonth} planos de treino/mês` : 'Planos ilimitados',
                  `Taxa da plataforma: ${Math.round(plan.commissionRate * 100)}%`,
                  plan.allowFlexibleDistribution && 'Distribuição flexível de receita',
                  plan.allowHourlyRate && 'Cobrança por hora de aula',
                  plan.creditsPerPeriod ? `${plan.creditsPerPeriod} créditos de IA/${plan.creditResetPeriod === 'weekly' ? 'semana' : 'mês'}` : 'Créditos de IA incluídos',
                  'Dashboard completo de alunos',
                  'Biblioteca de vídeos e exercícios',
                  'Chat e agendamentos integrados',
                  'Cobrança automática configurada',
                ].filter(Boolean)

                return (
                  <div key={plan.id}
                    className={`relative bg-[#0c1018] border rounded-2xl p-8 transition-all flex flex-col ${isHighlighted
                      ? 'border-[#39ff6a] shadow-lg shadow-[#39ff6a]/10 ring-1 ring-[#39ff6a]/20'
                      : 'border-[#1e2535] hover:border-[#253050]'
                      }`}>
                    {isHighlighted && (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#39ff6a] text-black text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
                        Mais Popular
                      </span>
                    )}
                    <h3 className="font-bold text-[#39ff6a] text-sm uppercase tracking-widest mb-6">{plan.name}</h3>

                    <div className="mb-2">
                      {plan.price === 0 ? (
                        <span className="fd font-black text-5xl text-white">Grátis</span>
                      ) : (
                        <>
                          <span className="text-gray-400 text-lg mr-1">R$</span>
                          <span className="fd font-black text-5xl text-white">{plan.price?.toFixed(plan.price % 1 === 0 ? 0 : 2)}</span>
                          <span className="text-gray-400 text-sm">/MÊS</span>
                        </>
                      )}
                    </div>

                    {plan.description && (
                      <p className="text-gray-500 text-sm mb-8 pb-8 border-b border-[#1e2535]">{plan.description}</p>
                    )}

                    <ul className="space-y-4 mb-8 flex-1">
                      {features.map((feat, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                          <Check className="w-4 h-4 text-[#39ff6a] mt-0.5 shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleSubscribe(plan.slug)}
                      className={`w-full py-4 rounded-xl font-bold transition-all mt-auto ${isHighlighted
                        ? 'bg-[#39ff6a] text-black hover:bg-[#2ee05e]'
                        : 'bg-transparent text-white hover:bg-[#131924] border border-[#1e2535]'
                        }`}>
                      Quero este plano
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-center text-sm text-gray-500 mt-12">
            <span className="text-[#39ff6a] font-medium">Passou de 2.500 alunos ativos?</span> Entre em contato com a nossa equipe — a taxa pode ser negociada.
          </p>
        </section>

        {/* ── CTA FINAL ───────────────────────────────────────────────────── */}
        <section className="border-t border-[#161e2e] py-32 bg-[#0a0c12]">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <p className="text-xs font-bold text-[#39ff6a] uppercase tracking-widest mb-6">PRONTO PARA ESCALAR?</p>
            <h2 className="fd font-black text-5xl md:text-7xl uppercase leading-[1.1] mb-8">
              Seu negócio não<br />
              cabe mais no <span className="text-[#39ff6a]">WhatsApp</span>
            </h2>
            <p className="text-gray-400 text-lg mb-12 max-w-2xl mx-auto leading-relaxed">
              Crie sua conta agora e comece a montar uma operação profissional — com treinos organizados, alunos acompanhados e renda recorrente crescendo todo mês.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={handleCTA}
                className="bg-[#39ff6a] text-black font-bold px-8 py-4 rounded-xl hover:bg-[#2ee05e] transition-all hover:scale-105 active:scale-95">
                {status === 'authenticated' ? 'Ir para Dashboard' : 'Cadastrar na plataforma agora'}
              </button>
              <button className="text-white hover:text-[#39ff6a] transition-colors font-medium flex items-center gap-2 bg-transparent border-0 cursor-pointer px-4 py-4">
                Falar com a equipe <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ── FOOTER ──────────────────────────────────────────────────────── */}
        <footer className="bg-[#0a0c12] py-12 border-t border-[#161e2e]">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#39ff6a] rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-black" strokeWidth={2.5} />
                </div>
                <span className="fd font-black text-lg tracking-tight">
                  <span className="text-white">PLAY</span>{' '}
                  <span className="text-[#39ff6a]">ACTION</span>
                </span>
              </div>
              <p className="text-xs text-gray-600 hidden md:block">
                © 2026 Play Action. Todos os direitos reservados.
              </p>
            </div>

            <div className="flex items-center gap-6 text-xs text-gray-500">
              <Link href="/affiliate" className="hover:text-[#f472b6] cursor-pointer transition-colors">Programa de Afiliados</Link>
              <Link href="/termos-de-uso" className="hover:text-white cursor-pointer transition-colors">Termos de Uso</Link>
              <Link href="/politica-de-privacidade" className="hover:text-white cursor-pointer transition-colors">Privacidade</Link>
              <Link href="/politica-de-reembolso" className="hover:text-white cursor-pointer transition-colors">Reembolso</Link>
            </div>

            <p className="text-xs text-gray-600 block md:hidden">
              © 2026 Play Action. Todos os direitos reservados.
            </p>
          </div>
        </footer>

      </div>
    </>
  )
}