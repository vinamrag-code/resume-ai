import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { Modal, Spinner } from '@/components/ui'
import { useAuth } from '@/lib/auth/store'
import { passwordStrength, validateEmail, validateLogin, validateSignUp } from '@/lib/auth/validate'
import type { FieldErrors, SignUpValues } from '@/lib/auth/validate'

export type AuthMode = 'login' | 'signup'

function Field({
  label,
  type = 'text',
  value,
  onChange,
  error,
  autoComplete,
  hint,
  autoFocus,
  reveal,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  error?: string
  autoComplete?: string
  hint?: string
  autoFocus?: boolean
  /** Adds a show/hide toggle (for passwords). */
  reveal?: boolean
}) {
  const id = useId()
  const [shown, setShown] = useState(false)
  const describedBy = [error ? `${id}-err` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={reveal && shown ? 'text' : type}
          className={`input h-10 ${reveal ? 'pr-14' : ''} ${error ? 'border-red-500 dark:border-red-500' : ''}`}
          value={value}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
        {reveal && (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs font-medium text-ink-500 hover:text-ink-900 dark:hover:text-ink-100" onClick={() => setShown((s) => !s)} aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`}>
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-500 dark:text-ink-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}

function StrengthMeter({ password }: { password: string }) {
  if (!password) return null
  const score = passwordStrength(password)
  const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Excellent']
  return (
    <div className="mb-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < score ? (score <= 1 ? 'bg-red-500' : score === 2 ? 'bg-spark-500' : 'bg-brand-500') : 'bg-ink-200 dark:bg-ink-700'}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">Password strength: {labels[score]}</p>
    </div>
  )
}

function SubmitButton({ busy, children }: { busy: boolean; children: string }) {
  return (
    <button type="submit" className="btn-primary h-10 w-full" disabled={busy}>
      {busy ? (
        <>
          <Spinner label="Please wait" /> Please wait…
        </>
      ) : (
        children
      )}
    </button>
  )
}

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const { signInWithEmail, busy, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors<{ email: string; password: string }>>({})
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validateLogin(email, password)
    setErrors(found)
    if (Object.keys(found).length) return
    await signInWithEmail(email, password)
  }
  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3.5" aria-label="Log in">
      <Field label="Email" type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="email" autoFocus />
      <Field label="Password" type="password" value={password} onChange={setPassword} error={errors.password} autoComplete="current-password" reveal />
      <div className="text-right">
        <button type="button" className="text-xs font-medium text-brand-700 underline dark:text-brand-300" onClick={onForgot}>
          Forgot password?
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <SubmitButton busy={busy}>Log in</SubmitButton>
    </form>
  )
}

function SignUpForm() {
  const { signUp, busy, error } = useAuth()
  const [v, setV] = useState<SignUpValues>({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<FieldErrors<SignUpValues>>({})
  const set = (k: keyof SignUpValues) => (val: string) => {
    setV((p) => ({ ...p, [k]: val }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined })) // clear an error as soon as the user edits that field
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validateSignUp(v)
    setErrors(found)
    if (Object.keys(found).length) return
    await signUp({ name: v.name.trim().replace(/\s+/g, ' '), email: v.email, password: v.password })
  }
  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3.5" aria-label="Sign up">
      <Field label="Full name" value={v.name} onChange={set('name')} error={errors.name} autoComplete="name" autoFocus />
      <Field label="Email" type="email" value={v.email} onChange={set('email')} error={errors.email} autoComplete="email" />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Password" type="password" value={v.password} onChange={set('password')} error={errors.password} autoComplete="new-password" reveal />
        <Field label="Confirm password" type="password" value={v.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" reveal />
      </div>
      <div>
        <StrengthMeter password={v.password} />
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">At least 8 characters, with a letter and a number.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <SubmitButton busy={busy}>Create account</SubmitButton>
      <p className="text-center text-xs text-ink-500 dark:text-ink-400">We will email you a link to confirm your address.</p>
    </form>
  )
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const { resetPassword, busy, error } = useAuth()
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | undefined>()
  const [sent, setSent] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validateEmail(email)
    setErr(found)
    if (found) return
    setSent(await resetPassword(email))
  }
  if (sent) {
    return (
      <div className="space-y-3" role="status">
        <p className="text-sm">If an account exists for <strong>{email.trim()}</strong>, a password reset link is on its way. Check your inbox and spam folder.</p>
        <button type="button" className="btn-secondary w-full" onClick={onBack}>
          Back to log in
        </button>
      </div>
    )
  }
  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3" aria-label="Reset password">
      <p className="text-sm text-ink-600 dark:text-ink-300">Enter your email and we will send you a link to choose a new password.</p>
      <Field label="Email" type="email" value={email} onChange={setEmail} error={err} autoComplete="email" autoFocus />
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <SubmitButton busy={busy}>Send reset link</SubmitButton>
      <button type="button" className="btn-ghost w-full" onClick={onBack}>
        Back to log in
      </button>
    </form>
  )
}

/** Animated modal with Log in / Sign up tabs, plus Google and password reset. */
export function AuthModal({ initialMode, onClose }: { initialMode: AuthMode; onClose: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [forgot, setForgot] = useState(false)
  const clearError = useAuth((s) => s.clearError)
  const switchTo = (m: AuthMode) => {
    clearError()
    setForgot(false)
    setMode(m)
  }
  return (
    <Modal title={forgot ? 'Reset your password' : mode === 'login' ? 'Welcome back' : 'Create your account'} onClose={onClose} size="md">
      {!forgot && (
        <div role="tablist" aria-label="Account" className="mb-4 grid grid-cols-2 border-b border-ink-200 dark:border-ink-700">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchTo(m)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${mode === m ? 'border-brand-500 text-brand-600 dark:text-brand-300' : 'border-transparent text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100'}`}
            >
              {m === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>
      )}
      <p className="mb-4 text-sm text-ink-500 dark:text-ink-400">
        {forgot ? 'We will email you a reset link.' : mode === 'login' ? 'Log in to pick up where you left off.' : 'Free, and your resumes stay yours.'}
      </p>
      {!forgot && (
        <>
          <GoogleSignInButton showError={false} label={mode === 'login' ? 'Continue with Google' : 'Sign up with Google'} fullWidth />
          <div className="my-5 flex items-center gap-3 text-xs text-ink-400" aria-hidden="true">
            <span className="h-px flex-1 bg-ink-200 dark:bg-ink-700" /> or with email <span className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
          </div>
        </>
      )}
      <div key={`${mode}-${forgot}`} className="animate-fade-up">
        {forgot ? <ForgotForm onBack={() => setForgot(false)} /> : mode === 'login' ? <LoginForm onForgot={() => setForgot(true)} /> : <SignUpForm />}
      </div>
    </Modal>
  )
}
