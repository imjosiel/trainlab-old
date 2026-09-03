'use client'

/**
 * ThemeProvider
 * Fetches /api/admin/settings on mount, reads uiTheme, and applies
 * data-theme="dark-blue" (or removes it for "light") on <html>.
 * This runs client-side only, so it doesn't block SSR.
 */
import { useEffect } from 'react'

export function ThemeProvider() {
    useEffect(() => {
        // Check sessionStorage cache (15 min TTL) to avoid fetching on every navigation
        const CACHE_KEY = 'pa_ui_theme'
        const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

        const cached = sessionStorage.getItem(CACHE_KEY)
        if (cached) {
            try {
                const { theme, ts } = JSON.parse(cached)
                if (Date.now() - ts < CACHE_TTL) {
                    applyTheme(theme)
                    return
                }
            } catch {}
        }

        fetch('/api/admin/settings', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                const theme = data?.uiTheme || 'light'
                applyTheme(theme)
                // Cache the result
                sessionStorage.setItem(CACHE_KEY, JSON.stringify({ theme, ts: Date.now() }))
            })
            .catch(() => {
                // Fallback silently to light theme on error
            })
    }, [])

    return null // purely side-effect component
}

function applyTheme(theme) {
    const html = document.documentElement
    if (theme === 'dark-blue') {
        html.setAttribute('data-theme', 'dark-blue')
    } else {
        html.removeAttribute('data-theme')
    }
}
