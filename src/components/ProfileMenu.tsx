import { useEffect, useId, useRef, useState } from 'react'
import { IconSettings, IconUser } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { useAuth } from '@/lib/auth/store'
import { useSyncStatus } from '@/lib/sync/engine'
import { useResumes } from '@/store/resumes'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase()
}

/** Profile button with a dropdown. There are no accounts; the name comes from your most recent resume. */
export function ProfileMenu({ active = false, placement = 'header', collapsed }: { active?: boolean; placement?: 'header' | 'sidebar'; collapsed?: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const resumeName = useResumes((s) => s.resumes.find((r) => r.content.contact.name.trim())?.content.contact.name.trim() ?? '')
  const resumeEmail = useResumes((s) => s.resumes.find((r) => r.content.contact.email.trim())?.content.contact.email.trim() ?? '')
  const auth = useAuth()
  const sync = useSyncStatus()
  const name = auth.user?.name || resumeName
  const email = auth.user?.email || resumeEmail

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        root.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const showName = collapsed !== undefined
  const initials = initialsOf(name)
  return (
    <div ref={root} className={`relative ${showName ? 'w-full' : ''}`}>
      <button
        type="button"
        aria-label="Profile"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={active ? 'page' : undefined}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={showName ? 'flex w-full items-center gap-2.5 overflow-hidden rounded-lg p-1.5 text-left hover:bg-ink-100 dark:hover:bg-ink-800' : undefined}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ${active ? 'ring-2 ring-brand-300 ring-offset-2 ring-offset-white dark:ring-offset-ink-950' : ''} bg-brand-600 text-sm font-semibold text-white ${showName ? '' : 'hover:bg-brand-700'} dark:bg-brand-500 dark:text-white`}>
          {auth.user?.picture ? (
            <img src={auth.user.picture} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full object-cover" />
          ) : initials || (
            <IconUser className="h-5 w-5" stroke={2} aria-hidden="true" />
          )}
        </span>
        {showName && <span className={`min-w-0 flex-1 truncate whitespace-nowrap text-sm font-medium transition-opacity duration-300 motion-reduce:transition-none ${collapsed ? 'opacity-0' : 'opacity-100'}`}>{name || (auth.user ? 'Signed in' : 'Your profile')}</span>}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Profile menu" className={`absolute z-40 w-64 ${placement === 'sidebar' ? 'bottom-11 left-0' : 'right-0 top-11'} rounded-xl border border-ink-200 bg-white p-1.5 shadow-lg dark:border-ink-700 dark:bg-ink-900`}>
          <div className="border-b border-ink-100 px-3 py-2 dark:border-ink-800">
            <p className="truncate text-sm font-semibold">{name || (auth.user ? 'Signed in' : 'Your profile')}</p>
            <p className="truncate text-xs text-ink-500 dark:text-ink-400">{email || 'Saved in this browser only'}</p>
          </div>
          {auth.required && !auth.user && auth.loaded && (
            <div className="px-3 py-2" role="none">
              <p className="mb-2 text-xs text-ink-500 dark:text-ink-400">Sign in to use AI features and sync across devices.</p>
              <GoogleSignInButton />
            </div>
          )}
          {auth.user && (
            <p className="px-3 py-1.5 text-xs text-ink-500 dark:text-ink-400" role="status">
              {sync.state === 'syncing' ? 'Syncing…' : sync.state === 'error' ? `Sync problem: ${sync.error}` : sync.lastSynced ? `Synced ${new Date(sync.lastSynced).toLocaleTimeString()}` : 'Sync on'}
            </p>
          )}
          <Link
            role="menuitem"
            to="/settings"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <IconSettings className="h-4 w-4" stroke={2} aria-hidden="true" />
            Settings
          </Link>
          {auth.user && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                void auth.signOut()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-ink-100 dark:hover:bg-ink-800"
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  )
}
