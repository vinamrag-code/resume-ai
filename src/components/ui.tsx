import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LlmError } from '@/lib/llm/types'

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export function ErrorBanner({ error, onDismiss }: { error: unknown; onDismiss?: () => void }) {
  if (!error) return null
  const needsSettings = error instanceof LlmError && (error.kind === 'unreachable' || error.kind === 'model-missing')
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      <div>
        <p>{errorMessage(error)}</p>
        {needsSettings && (
          <Link to="/settings" className="mt-1 inline-block font-medium underline">
            Open Settings to check your Ollama connection
          </Link>
        )}
      </div>
      {onDismiss && (
        <button type="button" className="shrink-0 font-medium underline" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 p-8 text-center dark:border-ink-700">
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-500 dark:text-ink-400">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function TruthfulnessNote({ className = '' }: { className?: string }) {
  return (
    <p className={`rounded-lg border border-brand-200 bg-brand-50 p-2.5 text-xs text-brand-900 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100 ${className}`}>
      <strong>Truthful by design.</strong> The AI may reword and reprioritise what is already in your resume. It is instructed never to invent employers, titles, dates, degrees, metrics or skills. Always review changes before accepting.
    </p>
  )
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-ink-500 dark:text-ink-400">
        <span>{label}</span>
        <span>{v}%</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} className="h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-ink-900">
        <h2 id={titleId} className="mb-3 text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return <img src="/logo.svg" alt="" aria-hidden="true" className={className} />
}
