import type { Change } from '@/lib/changes'
import { DiffView } from './DiffView'

interface Props {
  change: Change
  /** True when an accepted change has already been written into the resume. */
  applied?: boolean
  /** True when the resume text changed since the suggestion was made. */
  outdated?: boolean
  onAccept: () => void
  onReject: () => void
  onUndo?: () => void
}

export function ChangeCard({ change, applied, outdated, onAccept, onReject, onUndo }: Props) {
  const border =
    change.status === 'accepted' ? 'border-brand-500' : change.status === 'rejected' ? 'border-ink-200 opacity-60 dark:border-ink-700' : 'border-ink-200 dark:border-ink-700'
  return (
    <li className={`card space-y-2 border-2 ${border}`} aria-label={`Change: ${change.label}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{change.label}</h3>
        <div className="flex items-center gap-1.5" role="group" aria-label={`Decision for ${change.label}`}>
          {applied && <span className="text-xs font-medium text-brand-700 dark:text-brand-300">Applied ✓</span>}
          {applied && onUndo && (
            <button type="button" className="btn-ghost btn-sm" onClick={onUndo}>
              Undo
            </button>
          )}
          {!applied && (
            <button type="button" className={change.status === 'accepted' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} aria-pressed={change.status === 'accepted'} disabled={outdated} onClick={onAccept}>
              Accept
            </button>
          )}
          <button type="button" className={change.status === 'rejected' ? 'btn-danger btn-sm bg-red-50' : 'btn-secondary btn-sm'} aria-pressed={change.status === 'rejected'} onClick={onReject}>
            Reject
          </button>
        </div>
      </div>
      <DiffView before={change.before} after={change.after} />
      {change.reason && <p className="text-xs text-ink-500 dark:text-ink-400">Why: {change.reason}</p>}
      {outdated && <p className="text-xs text-ink-500">This part of your resume changed since the suggestion, so it can no longer be applied.</p>}
      {change.warnings.map((w) => (
        <p key={w} role="note" className="rounded bg-spark-400/20 p-1.5 text-xs text-ink-800 dark:text-spark-400">
          ⚠ {w}
        </p>
      ))}
    </li>
  )
}
