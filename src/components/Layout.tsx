import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ProfileMenu } from '@/components/ProfileMenu'
import { Logo } from '@/components/ui'
import { useSettings } from '@/store/settings'
import type { ThemePref } from '@/store/settings'

/** `match` decides which paths highlight an item (an open resume and the import page belong to "Resumes"). */
const NAV = [
  { to: '/', label: 'Resumes', match: (p: string) => p === '/' || p.startsWith('/resume') || p.startsWith('/import') },
  { to: '/bank', label: 'Experience bank', match: (p: string) => p.startsWith('/bank') },
  { to: '/tracker', label: 'Tracker', match: (p: string) => p.startsWith('/tracker') },
  { to: '/cover', label: 'Cover letters', match: (p: string) => p.startsWith('/cover') },
]

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_LABEL: Record<ThemePref, string> = { system: 'system', light: 'light', dark: 'dark' }

function ThemeIcon({ theme }: { theme: ThemePref }) {
  const common = { viewBox: '0 0 24 24', className: 'h-5 w-5', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (theme === 'light')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  if (theme === 'dark')
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  )
}

export function useApplyTheme() {
  const theme = useSettings((s) => s.theme)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && !!mq?.matches))
    apply()
    mq?.addEventListener?.('change', apply)
    return () => mq?.removeEventListener?.('change', apply)
  }, [theme])
}

export function Layout() {
  useApplyTheme()
  const theme = useSettings((s) => s.theme)
  const update = useSettings((s) => s.update)
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2 focus:text-ink-900">
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-30 border-b border-ink-200 bg-white/90 backdrop-blur dark:border-ink-800 dark:bg-ink-900/90">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo />
            <span>Resume AI</span>
          </Link>
          <nav aria-label="Main" className="flex flex-1 flex-wrap items-center gap-1">
            {NAV.map((n) => {
              const active = n.match(pathname)
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active ? 'bg-brand-600 text-white shadow-sm dark:bg-brand-500 dark:text-ink-950' : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'}`}
                >
                  {n.label}
                </Link>
              )
            })}
          </nav>
          <button
            type="button"
            className="btn-ghost h-9 w-9 rounded-full p-0"
            onClick={() => update({ theme: NEXT_THEME[theme] })}
            aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[NEXT_THEME[theme]]}`}
            title={`Theme: ${THEME_LABEL[theme]}`}
          >
            <ThemeIcon theme={theme} />
          </button>
          <ProfileMenu active={pathname.startsWith('/settings')} />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="no-print border-t border-ink-200 px-4 py-3 text-center text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
        Resume AI is free and open source. Your data stays in this browser; AI runs on your own Ollama server.
      </footer>
    </div>
  )
}
