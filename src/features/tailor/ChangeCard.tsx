import type { Change } from '@/lib/changes'
import { DiffView } from './DiffView'

export function ChangeCard({ change, onAccept, onReject }: { change: Change; onAccept: () => void; onReject: () => void }) {
  const border =
    change.status === 'accepted' ? 'border-brand-500' : change.status === 'rejected' ? 'border-ink-200 opacity-60 dark:border-ink-700' : 'border-ink-200 dark:border-ink-700'
  return (
    <li className={`card space-y-2 border-2 ${border}`} aria-label={`Change: ${change.label}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{change.label}</h3>
        <div className="flex gap-1.5" role="group" aria-label={`Decision for ${change.label}`}>
          <button type="button" className={change.status === 'accepted' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} aria-pressed={change.status === 'accepted'} onClick={onAccept}>
            Accept
          </button>
          <button type="button" className={change.status === 'rejected' ? 'btn-danger btn-sm bg-red-50' : 'btn-secondary btn-sm'} aria-pressed={change.status === 'rejected'} onClick={onReject}>
            Reject
          </button>
        </div>
      </div>
      <DiffView before={change.before} after={change.after} />
      {change.reason && <p className="text-xs text-ink-500 dark:text-ink-400">Why: {change.reason}</p>}
      {change.warnings.map((w) => (
        <p key={w} role="note" className="rounded bg-spark-400/20 p-1.5 text-xs text-ink-800 dark:text-spark-400">
          ⚠ {w}
        </p>
      ))}
    </li>
  )
}
