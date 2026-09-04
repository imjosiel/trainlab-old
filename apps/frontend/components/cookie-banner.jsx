'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Cookie, Shield } from 'lucide-react'

const STORAGE_KEY = 'cookie_consent'

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        // Small delay so the slide-up animation is visible
        const timer = setTimeout(() => setVisible(true), 500)
        return () => clearTimeout(timer)
      }
    } catch {
      // localStorage unavailable (SSR / private browsing)
    }
  }, [])

  function saveConsent(accepted) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accepted, timestamp: new Date().toISOString() })
      )
    } catch {
      // silently fail
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Consentimento de cookies"
      className="fixed bottom-0 inset-x-0 z-50 animate-in slide-in-from-bottom duration-500 fill-mode-forwards"
    >
      <div className="mx-auto max-w-5xl px-4 pb-4 sm:px-6">
        <div className="rounded-2xl border border-white/10 bg-gray-950/80 backdrop-blur-xl shadow-2xl shadow-black/30 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            {/* Icon + Text */}
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Shield className="h-5 w-5" />
              </div>
              <p className="text-sm leading-relaxed text-gray-300">
                Utilizamos cookies essenciais para o funcionamento da plataforma.
                Saiba mais em nossa{' '}
                <Link
                  href="/politica-de-privacidade"
                  className="font-medium text-emerald-400 underline underline-offset-2 hover:text-emerald-300 transition-colors"
                >
                  Política de Privacidade
                </Link>
                .
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveConsent(false)}
                className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                Apenas Essenciais
              </Button>
              <Button
                size="sm"
                onClick={() => saveConsent(true)}
                className="bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/30"
              >
                <Cookie className="h-4 w-4 mr-1" />
                Aceitar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
