import { IconLayoutDashboard, IconFileText, IconLayoutKanban, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconMail, IconMailForward, IconMenu2, IconMoon, IconStack2, IconSun } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ProfileMenu } from '@/components/ProfileMenu'
import { Logo } from '@/components/ui'
import { useSettings } from '@/store/settings'
import type { ThemePref } from '@/store/settings'

/** `match` decides which paths highlight an item (an open resume and the import page belong to "Resumes"). */
const NAV = [
  { to: '/', label: 'Dashboard', icon: IconLayoutDashboard, match: (p: string) => p === '/' },
  { to: '/resumes', label: 'Resumes', icon: IconFileText, match: (p: string) => p.startsWith('/resumes') || p.startsWith('/resume/') || p.startsWith('/import') || p.startsWith('/build') },
  { to: '/bank', label: 'Experience bank', icon: IconStack2, match: (p: string) => p.startsWith('/bank') },
  { to: '/tracker', label: 'Tracker', icon: IconLayoutKanban, match: (p: string) => p.startsWith('/tracker') },
  { to: '/cover', label: 'Cover letters', icon: IconMail, match: (p: string) => p.startsWith('/cover') },
  { to: '/mail', label: 'Emails', icon: IconMailForward, match: (p: string) => p.startsWith('/mail') },
]

const NEXT_THEME: Record<ThemePref, ThemePref> = { light: 'dark', dark: 'light' }
const THEME_LABEL: Record<ThemePref, string> = { light: 'light', dark: 'dark' }

function ThemeIcon({ theme }: { theme: ThemePref }) {
  const Icon = theme === 'light' ? IconSun : IconMoon
  return <Icon className="h-5 w-5 shrink-0" stroke={2} aria-hidden="true" />
}

export function useApplyTheme() {
  const theme = useSettings((s) => s.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
}

/** The left navigation. `rail` shows icons only (used while a resume is open, which needs the width). */
function Sidebar({ rail, onNavigate, onToggleRail }: { rail: boolean; onNavigate?: () => void; onToggleRail?: () => void }) {
  const { pathname } = useLocation()
  const theme = useSettings((s) => s.theme)
  const update = useSettings((s) => s.update)
  const collapseBtn = onToggleRail && (
    <button
      type="button"
      className={`absolute top-[1.125rem] z-10 hidden h-7 w-7 items-center justify-center rounded-full border text-ink-500 transition-[left,background-color,border-color,box-shadow] duration-500 ease-in-out hover:text-brand-600 motion-reduce:transition-none dark:text-ink-400 dark:hover:text-brand-300 lg:inline-flex ${rail ? 'left-[calc(100%+0.625rem)] border-ink-200 bg-white shadow-sm dark:border-ink-700 dark:bg-ink-900' : 'left-[calc(100%-2.5rem)] border-transparent hover:bg-ink-100 dark:hover:bg-ink-800'}`}
      onClick={onToggleRail}
      aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-expanded={!rail}
      title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {rail ? <IconLayoutSidebarLeftExpand className="h-4 w-4" stroke={2} aria-hidden="true" /> : <IconLayoutSidebarLeftCollapse className="h-4 w-4" stroke={2} aria-hidden="true" />}
    </button>
  )
  return (
    <div className="relative flex h-full flex-col gap-4 p-3">
      <div className="flex items-center gap-1">
        <Link to="/" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-2.5 py-1.5 font-semibold tracking-tight" aria-label="Resume AI home">
          <Logo className="h-7 w-7 shrink-0" />
          <span className={`whitespace-nowrap transition-opacity duration-300 motion-reduce:transition-none ${rail ? 'opacity-0' : 'opacity-100'}`}>Resume AI</span>
        </Link>
        {collapseBtn}
      </div>
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
              className={`group flex items-center gap-3 overflow-hidden rounded-lg px-[14px] py-2 text-sm font-medium transition ${active ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 dark:bg-brand-500 dark:text-white' : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'}`}
            >
              <n.icon className="h-5 w-5 shrink-0" stroke={1.8} aria-hidden="true" />
              <span className={`whitespace-nowrap transition-opacity duration-300 motion-reduce:transition-none ${rail ? 'opacity-0' : 'opacity-100'}`}>{n.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className={`flex flex-col gap-1 border-t border-ink-200 pt-3 dark:border-ink-800`}>
        <button
          type="button"
          className="btn-ghost h-9 w-full justify-start gap-3 overflow-hidden rounded-lg px-[14px]"
          onClick={() => update({ theme: NEXT_THEME[theme] })}
          aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[NEXT_THEME[theme]]}`}
          title={`Theme: ${THEME_LABEL[theme]}`}
        >
          <ThemeIcon theme={theme} />
          <span aria-hidden="true" className={`capitalize `+`whitespace-nowrap transition-opacity duration-300 motion-reduce:transition-none ${rail ? 'opacity-0' : 'opacity-100'}`}>{THEME_LABEL[theme]} mode</span>
        </button>
        <ProfileMenu active={pathname.startsWith('/settings')} placement="sidebar" collapsed={rail} />
      </div>
    </div>
  )
}

export function Layout() {
  useApplyTheme()
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
  // The sidebar is a rail while a resume is open unless the user chose otherwise; the choice is remembered.
  const [railPref, setRailPref] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem('sidebar-collapsed')
      return v === null ? null : v === '1'
    } catch {
      return null
    }
  })
  const rail = railPref ?? isWorkspace
  const toggleRail = () => {
    setRailPref(!rail)
    try {
      localStorage.setItem('sidebar-collapsed', rail ? '0' : '1')
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }
  const maxW = isWorkspace ? '' : 'max-w-[1400px]'
  return (
    <div className={`relative flex min-h-screen ${isWorkspace ? 'lg:h-[100dvh] lg:overflow-hidden' : ''}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2 focus:text-ink-900">
        Skip to content
      </a>
      <aside className={`no-print hidden shrink-0 border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950 lg:sticky lg:top-0 lg:z-30 lg:block transition-[width] duration-500 ease-in-out motion-reduce:transition-none lg:h-[100dvh] ${rail ? 'lg:w-[4.5rem]' : 'lg:w-60'}`}>
        <Sidebar rail={rail} onToggleRail={toggleRail} />
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
        <header className="no-print sticky top-0 z-30 border-b lg:hidden border-ink-200 bg-white/80 backdrop-blur-xl dark:border-ink-800/80 dark:bg-ink-950/80">
          <div className={`mx-auto flex ${maxW} items-center gap-3 px-4 py-2.5`}>
            <button type="button" className="btn-ghost h-9 w-9 rounded-lg p-0" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>
              <IconMenu2 className="h-5 w-5" stroke={2} aria-hidden="true" />
            </button>
            <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Logo />
              <span>Resume AI</span>
            </Link>
          </div>
        </header>
        <main id="main" className={`relative mx-auto w-full ${maxW} flex-1 px-4 py-6 ${isWorkspace ? 'lg:flex lg:min-h-0 lg:flex-col' : ''}`}>
          <Outlet />
        </main>
        <footer className="no-print border-t border-ink-200 px-4 py-3 text-center text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
          <strong>Truthful by design.</strong> The AI may reword and reprioritise what is already in your resume. It is instructed never to invent employers, titles, dates, degrees, metrics or skills. Always review changes before accepting.
          <br />
          Your data stays in this browser; AI answers come through this site's server. ·{' '}
          <Link to="/welcome" className="underline hover:text-brand-600 dark:hover:text-brand-300">
            About Resume AI
          </Link>
        </footer>
      </div>
    </div>
  )
}
