import { Inter } from 'next/font/google'
import '../globals.css'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { Toaster } from '@/components/ui/sonner'
import { SessionProvider } from '@/components/session-provider'
import { ThemeProvider } from '@/components/theme-provider'
import AffiliateTracker from '@/components/affiliate-tracker'
import CookieBanner from '@/components/cookie-banner'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Player.Action - Treino Inteligente de Futebol',
  description: 'Plataforma SaaS de treinos personalizados de futebol com Inteligência Artificial',
}

export default async function RootLayout({ children, params }) {
  const { locale } = await params
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <head>
        {/* Script inline síncrono: aplica data-theme ANTES do paint para evitar flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var cached = sessionStorage.getItem('pa_ui_theme');
                if (cached) {
                  var d = JSON.parse(cached);
                  if (d.theme === 'dark-blue' && Date.now() - d.ts < 900000) {
                    document.documentElement.setAttribute('data-theme', 'dark-blue');
                  }
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
          <SessionProvider>
            <ThemeProvider />
            <AffiliateTracker />
            {children}
          </SessionProvider>
          <Toaster />
          <CookieBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}