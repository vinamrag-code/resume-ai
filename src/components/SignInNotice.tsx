import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { canUseAi, useAuth } from '@/lib/auth/store'

/** Shown above AI features when sign-in is required and the visitor has not signed in. Manual editing never needs it. */
export function SignInNotice({ feature = 'AI features' }: { feature?: string }) {
  const allowed = useAuth(canUseAi)
  const loaded = useAuth((s) => s.loaded)
  if (!loaded || allowed) return null
  return (
    <section className="card space-y-3 border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20" aria-label="Sign in required">
      <div>
        <h3 className="text-sm font-semibold">Sign in to use {feature}</h3>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          AI runs on the site owner&apos;s keys, so a free Google sign-in is needed. Editing, scoring and exporting your resume work without it. Signing in also syncs your data across devices.
        </p>
      </div>
      <GoogleSignInButton />
    </section>
  )
}
