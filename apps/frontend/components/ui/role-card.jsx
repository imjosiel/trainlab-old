'use client'

import { cn } from '@/lib/utils'
import { forwardRef } from 'react'
import { ArrowRight } from 'lucide-react'

const ROLE_STYLES = {
  PROFESSIONAL: {
    border: 'hover:border-[#39ff6a]/60 hover:bg-[#0f1a10]',
    accent: 'text-[#39ff6a]',
    bg: 'bg-[#39ff6a]/10 group-hover:bg-[#39ff6a]/20',
    shadow: 'hover:shadow-[#39ff6a]/5',
    btn: 'text-[#39ff6a]',
  },
  INDIVIDUAL: {
    border: 'hover:border-[#60a5fa]/60 hover:bg-[#0a0f1a]',
    accent: 'text-[#60a5fa]',
    bg: 'bg-[#60a5fa]/10 group-hover:bg-[#60a5fa]/20',
    shadow: 'hover:shadow-[#60a5fa]/5',
    btn: 'text-[#60a5fa]',
  },
  CLIENT: {
    border: 'hover:border-[#a78bfa]/60 hover:bg-[#0f0a1a]',
    accent: 'text-[#a78bfa]',
    bg: 'bg-[#a78bfa]/10 group-hover:bg-[#a78bfa]/20',
    shadow: 'hover:shadow-[#a78bfa]/5',
    btn: 'text-[#a78bfa]',
  },
  PARTNER: {
    border: 'hover:border-[#f59e0b]/60 hover:bg-[#1a140a]',
    accent: 'text-[#f59e0b]',
    bg: 'bg-[#f59e0b]/10 group-hover:bg-[#f59e0b]/20',
    shadow: 'hover:shadow-[#f59e0b]/5',
    btn: 'text-[#f59e0b]',
  },
  AFFILIATE: {
    border: 'hover:border-[#f472b6]/60 hover:bg-[#1a0a14]',
    accent: 'text-[#f472b6]',
    bg: 'bg-[#f472b6]/10 group-hover:bg-[#f472b6]/20',
    shadow: 'hover:shadow-[#f472b6]/5',
    btn: 'text-[#f472b6]',
  },
}

const RoleCard = forwardRef(({
  icon: Icon,
  title,
  description,
  role,
  onClick,
  className,
  ...props
}, ref) => {
  const style = ROLE_STYLES[role] || ROLE_STYLES.PROFESSIONAL

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center gap-4 p-8 rounded-2xl border border-[#1e2535] bg-[#0a0c12] transition-all duration-300 cursor-pointer text-left w-full',
        style.border,
        style.shadow,
        'hover:shadow-lg',
        className
      )}
      {...props}
    >
      {Icon && (
        <div className={cn(
          'w-14 h-14 rounded-2xl flex items-center justify-center transition-colors',
          style.bg
        )}>
          <Icon className={cn('w-7 h-7', style.accent)} strokeWidth={2} />
        </div>
      )}
      <div className="text-center">
        <p className="font-bold text-white text-lg mb-1">{title}</p>
        <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
      </div>
      <span className={cn(
        'mt-auto inline-flex items-center gap-2 text-sm font-semibold group-hover:gap-3 transition-all',
        style.btn
      )}>
        Entrar como {title?.split(' ').pop()?.toLowerCase() || 'acessar'} <ArrowRight className="w-4 h-4" />
      </span>
    </button>
  )
})
RoleCard.displayName = 'RoleCard'

export { RoleCard }
