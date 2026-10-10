import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth/store'

const SCRIPT = 'https://accounts.google.com/gsi/client'

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`)
    const s = existing ?? Object.assign(document.createElement('script'), { src: SCRIPT, async: true, defer: true })
    s.addEventListener('load', () => resolve(), { once: true })
    s.addEventListener('error', () => reject(new Error('Could not load Google sign-in. Check your connection or ad blocker.')), { once: true })
    if (!existing) document.head.appendChild(s)
  })
}

/** Google's official "Sign in with Google" button. The script loads only when this is shown. */
export function GoogleSignInButton({ text = 'signin_with' }: { text?: 'signin_with' | 'continue_with' }) {
  const clientId = useAuth((s) => s.googleClientId)
  const signIn = useAuth((s) => s.signInWithCredential)
  const error = useAuth((s) => s.error)
  const holder = useRef<HTMLDivElement>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !holder.current || !window.google) return
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => void signIn(r.credential), cancel_on_tap_outside: true })
        window.google.accounts.id.renderButton(holder.current, { theme: 'outline', size: 'large', text, shape: 'pill' })
      })
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : 'Could not load Google sign-in.'))
    return () => {
      cancelled = true
    }
  }, [clientId, signIn, text])

  return (
    <div>
      <div ref={holder} data-testid="google-button" />
      {(loadError || error) && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {loadError ?? error}
        </p>
      )}
    </div>
  )
}
