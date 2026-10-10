import type { ReactNode } from 'react'
import { Logo, Spinner } from '@/components/ui'
import { useAuth } from '@/lib/auth/store'
import { LandingPage } from './LandingPage'
import { VerifyEmailPage } from './VerifyEmailPage'

/**
 * Blocks the whole app until the visitor is signed in with a verified email.
 * When the server has no sign-in configured (local development), the app is open.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const loaded = useAuth((s) => s.loaded)
  const required = useAuth((s) => s.required)
  const user = useAuth((s) => s.user)
  if (!loaded) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3" role="status" aria-label="Loading">
        <Logo className="h-10 w-10" />
        <Spinner label="Loading" />
      </div>
    )
  }
  if (!required) return <>{children}</>
  if (!user) return <LandingPage />
  if (!user.emailVerified) return <VerifyEmailPage />
  return <>{children}</>
}
