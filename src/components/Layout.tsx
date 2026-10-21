import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ProfileMenu } from '@/components/ProfileMenu'
import { Logo } from '@/components/ui'
import { useSettings } from '@/store/settings'
import type { ThemePref } from '@/store/settings'

const ICONS = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  resumes: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  bank: 'M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4',
  tracker: 'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z',
  cover: 'M3 6h18v12H3zM3 7l9 6 9-6',
}

/** `match` decides which paths highlight an item (an open resume and the import page belong to "Resumes"). */
const NAV = [
  { to: '/', label: 'Dashboard', icon: ICONS.dashboard, match: (p: string) => p === '/' },
  { to: '/resumes', label: 'Resumes', icon: ICONS.resumes, match: (p: string) => p.startsWith('/resumes') || p.startsWith('/resume/') || p.startsWith('/import') || p.startsWith('/build') },
  { to: '/bank', label: 'Experience bank', icon: ICONS.bank, match: (p: string) => p.startsWith('/bank') },
  { to: '/tracker', label: 'Tracker', icon: ICONS.tracker, match: (p: string) => p.startsWith('/tracker') },
  { to: '/cover', label: 'Cover letters', icon: ICONS.cover, match: (p: string) => p.startsWith('/cover') },
]

const NEXT_THEME: Record<ThemePref, ThemePref> = { light: 'dark', dark: 'light' }
const THEME_LABEL: Record<ThemePref, string> = { light: 'light', dark: 'dark' }

function ThemeIcon({ theme }: { theme: ThemePref }) {
  const common = { viewBox: '0 0 24 24', className: 'h-5 w-5', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (theme === 'light')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

export function useApplyTheme() {
  const theme = useSettings((s) => s.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
}

/** The left navigation. `rail` shows icons only (used while a resume is open, which needs the width). */
function Sidebar({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <Link to="/" onClick={onNavigate} className={`flex items-center gap-2 px-2 py-1.5 font-semibold tracking-tight ${rail ? 'justify-center' : ''}`} aria-label="Resume AI home">
        <Logo />
        <span className={rail ? 'sr-only' : ''}>Resume AI</span>
      </Link>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
        {NAV.map((n) => {
          const active = n.match(pathname)
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              title={rail ? n.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${rail ? 'justify-center px-0' : ''} ${active ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 dark:bg-brand-500 dark:text-white' : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'}`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={n.icon} />
              </svg>
              <span className={rail ? 'sr-only' : ''}>{n.label}</span>
            </Link>
          )
        })}
      </nav>
      {!rail && (
        <p className="rounded-lg bg-ink-50 p-3 text-xs text-ink-500 dark:bg-ink-900 dark:text-ink-400">
          Truthful by design: the AI only rewords what is already true about you.
        </p>
      )}
    </div>
  )
}

export function Layout() {
  useApplyTheme()
  const theme = useSettings((s) => s.theme)
  const update = useSettings((s) => s.update)
  const { pathname } = useLocation()
  const [drawer, setDrawer] = useState(false)
  // An open resume uses the whole browser width so the full-size page preview fits beside the editor and the assistant.
  const isWorkspace = /^\/resume\/[^/]+\/?$/.test(pathname)
  useEffect(() => {
    document.documentElement.classList.toggle('lock-page', isWorkspace)
    return () => document.documentElement.classList.remove('lock-page')
  }, [isWorkspace])
  useEffect(() => setDrawer(false), [pathname])
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])
  const maxW = isWorkspace ? '' : 'max-w-[1400px]'
  return (
    <div className={`relative flex min-h-screen ${isWorkspace ? 'lg:h-[100dvh] lg:overflow-hidden' : ''}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2 focus:text-ink-900">
        Skip to content
      </a>
      <aside className={`no-print hidden shrink-0 border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950 lg:sticky lg:top-0 lg:block lg:h-[100dvh] ${isWorkspace ? 'lg:w-[4.5rem]' : 'lg:w-60'}`}>
        <Sidebar rail={isWorkspace} />
      </aside>
      {drawer && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="animate-backdrop-in absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => setDrawer(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-ink-200 bg-white shadow-2xl dark:border-ink-800 dark:bg-ink-950" aria-label="Menu">
            <Sidebar rail={false} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className={`flex min-w-0 flex-1 flex-col ${isWorkspace ? 'lg:min-h-0' : ''}`}>
        <div aria-hidden="true" className="no-print pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgb(59_130_246/0.14),transparent)] dark:bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgb(37_99_235/0.22),transparent)]" />
        <header className="no-print sticky top-0 z-30 border-b border-ink-200 bg-white/80 backdrop-blur-xl dark:border-ink-800/80 dark:bg-ink-950/80">
          <div className={`mx-auto flex ${maxW} items-center gap-3 px-4 py-2.5`}>
            <button type="button" className="btn-ghost h-9 w-9 rounded-lg p-0 lg:hidden" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight lg:hidden">
              <Logo />
              <span>Resume AI</span>
            </Link>
            <div className="flex-1" />
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
        <main id="main" className={`relative mx-auto w-full ${maxW} flex-1 px-4 py-6 ${isWorkspace ? 'lg:flex lg:min-h-0 lg:flex-col' : ''}`}>
          <Outlet />
        </main>
        <footer className="no-print border-t border-ink-200 px-4 py-3 text-center text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
          Your data stays in this browser; AI answers come through this site's server. ·{' '}
          <Link to="/welcome" className="underline hover:text-brand-600 dark:hover:text-brand-300">
            About Resume AI
          </Link>
        </footer>
      </div>
    </div>
  )
}
