'use client'

import Link from 'next/link'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

const VARIANT_CONTENT = {
  signup: () => (
    <>
      Li e aceito os{' '}
      <Link
        href="/termos-de-uso"
        className="font-medium text-emerald-400 underline underline-offset-2 hover:text-emerald-300 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        Termos de Uso
      </Link>{' '}
      e a{' '}
      <Link
        href="/politica-de-privacidade"
        className="font-medium text-emerald-400 underline underline-offset-2 hover:text-emerald-300 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        Política de Privacidade
      </Link>
      .
    </>
  ),
  checkout: () => (
    <>
      Li e aceito os{' '}
      <Link
        href="/termos-de-uso"
        className="font-medium text-emerald-400 underline underline-offset-2 hover:text-emerald-300 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        termos
      </Link>
      . Entendo que posso cancelar em até 7 dias (CDC Art. 49).
    </>
  ),
  partner: () => (
    <>
      Li e aceito o{' '}
      <Link
        href="/contrato-parceiro"
        className="font-medium text-emerald-400 underline underline-offset-2 hover:text-emerald-300 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        Contrato de Parceiro
      </Link>{' '}
      e os termos de comissão da plataforma.
    </>
  ),
  affiliate: () => (
    <>
      Li e aceito os{' '}
      <Link
        href="/termos-afiliados"
        className="font-medium text-emerald-400 underline underline-offset-2 hover:text-emerald-300 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        Termos do Programa de Afiliados
      </Link>
      .
    </>
  ),
}

export default function TermsCheckbox({
  checked = false,
  onChange,
  variant = 'signup',
  className,
}) {
  const renderContent = VARIANT_CONTENT[variant] || VARIANT_CONTENT.signup

  return (
    <div className={cn('flex items-start gap-3', className)}>
      {/* LGPD Art. 8 §4 — checkbox must never be pre-checked */}
      <Checkbox
        id={`terms-${variant}`}
        checked={checked}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
      <label
        htmlFor={`terms-${variant}`}
        className="text-sm leading-relaxed text-gray-400 cursor-pointer select-none"
      >
        {renderContent()}
      </label>
    </div>
  )
}
