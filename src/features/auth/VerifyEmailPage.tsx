import { useEffect, useState } from 'react'
import { Logo, Spinner } from '@/components/ui'
import { useAuth } from '@/lib/auth/store'

/** Shown to email/password accounts until they click the link we emailed. Checks in the background too. */
export function VerifyEmailPage() {
  const { user, refreshUser, resendVerification, signOut, busy, error } = useAuth()
  const [note, setNote] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    const t = setInterval(() => void refreshUser(), 5000)
    return () => clearInterval(t)
  }, [refreshUser])
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const check = async () => {
    setNote('')
    await refreshUser()
    if (!useAuth.getState().user?.emailVerified) setNote('Not verified yet. Open the link in the email we sent, then try again.')
  }
  const resend = async () => {
    if (await resendVerification()) {
      setNote('Verification email sent. Check your inbox and spam folder.')
      setCooldown(30)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-white p-4 dark:from-ink-900 dark:to-ink-950">
      <main className="card animate-modal-in w-full max-w-md space-y-4 text-center">
        <Logo className="mx-auto h-10 w-10" />
        <h1 className="text-xl font-semibold">Check your inbox</h1>
        <p className="text-sm text-ink-600 dark:text-ink-300">
          We sent a confirmation link to <strong>{user?.email}</strong>. Click it to activate your account. This page updates by itself once you do.
        </p>
        {(note || error) && (
          <p role="status" className={`rounded-lg p-2.5 text-sm ${error ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200' : 'bg-ink-100 dark:bg-ink-800'}`}>
            {error ?? note}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button type="button" className="btn-primary" onClick={() => void check()}>
            I have verified my email
          </button>
          <button type="button" className="btn-secondary" onClick={() => void resend()} disabled={busy || cooldown > 0}>
            {busy ? <Spinner label="Sending" /> : cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => void signOut()}>
            Use a different account
          </button>
        </div>
      </main>
    </div>
  )
}
