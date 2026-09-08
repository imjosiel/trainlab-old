'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'

export function ModeToggle() {
    const { theme, setTheme } = useTheme()

    function toggle() {
        setTheme(theme === 'dark' ? 'light' : 'dark')
    }

    return (
        <button
            onClick={toggle}
            className="rounded-md p-2 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Alternar tema"
        >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Alternar tema</span>
        </button>
    )
}
