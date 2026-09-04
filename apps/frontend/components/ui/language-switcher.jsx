'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Globe } from 'lucide-react'

export function LanguageSwitcher() {
    const locale = useLocale()
    const router = useRouter()
    const pathname = usePathname()
    const [mounted, setMounted] = useState(false)

    // Avoid hydration mismatch by only rendering after mount
    useEffect(() => setMounted(true), [])

    if (!mounted) {
        return (
            <Button variant="ghost" size="sm" className="w-auto h-9 px-2.5 border-2 border-gray-300 rounded-md">
                <Globe className="h-[1.1rem] w-[1.1rem] text-slate-600" />
            </Button>
        )
    }

    const switchLocale = (newLocale) => {
        if (locale === newLocale) return;
        let newPath = pathname;

        // Remove current locale chunk if it exists (e.g., /en/dashboard -> /dashboard)
        if (pathname.startsWith(`/${locale}/`)) {
            newPath = pathname.replace(`/${locale}/`, `/`);
        } else if (pathname === `/${locale}`) {
            newPath = `/`;
        }

        // Add new locale chunk if it's not the default (pt-BR)
        if (newLocale !== 'pt-BR') {
            newPath = newPath === '/' ? `/${newLocale}` : `/${newLocale}${newPath}`;
        }

        // Ensures that the NEXT_LOCALE cookie changes by visiting the path directly
        document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
        router.push(newPath || '/');
        router.refresh(); // forces Next.js to reconstruct the Server Components with the new locale
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="w-auto h-9 px-2.5 gap-1 border-2 border-gray-300 rounded-md">
                    <Globe className="h-[1.1rem] w-[1.1rem] text-slate-600 hover:text-slate-900 shrink-0" />
                    <span className="sr-only">Toggle language</span>
                    <span className="hidden lg:flex text-xs font-medium text-slate-600 uppercase">
                        {locale.split('-')[0]}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => switchLocale('pt-BR')} className={locale === 'pt-BR' ? 'bg-slate-100 font-medium' : ''}>
                    Português (BR)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => switchLocale('en')} className={locale === 'en' ? 'bg-slate-100 font-medium' : ''}>
                    English
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => switchLocale('es')} className={locale === 'es' ? 'bg-slate-100 font-medium' : ''}>
                    Español
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
