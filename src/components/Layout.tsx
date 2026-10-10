import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from '@/components/ui'
import { useSettings } from '@/store/settings'
import type { ThemePref } from '@/store/settings'

const NAV = [
  { to: '/', label: 'Resumes', end: true },
  { to: '/tracker', label: 'Tracker', end: false },
  { to: '/cover', label: 'Cover letters', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }

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
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2 focus:text-ink-900">
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-30 border-b border-ink-200 bg-white/90 backdrop-blur dark:border-ink-800 dark:bg-ink-900/90">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo />
            <span>Resume AI</span>
          </NavLink>
          <nav aria-label="Main" className="flex flex-1 flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100' : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <button type="button" className="btn-ghost btn-sm" onClick={() => update({ theme: NEXT_THEME[theme] })} aria-label={`Theme: ${theme}. Switch theme`}>
            Theme: {theme}
          </button>
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
