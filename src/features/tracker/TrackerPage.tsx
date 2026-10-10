import { useState } from 'react'
import { EmptyState } from '@/components/ui'
import { useJobs } from '@/store/jobs'
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@/types/job'
import type { Job, JobStatus } from '@/types/job'
import { JobModal } from './JobModal'

export function TrackerPage() {
  const jobs = useJobs((s) => s.jobs)
  const move = useJobs((s) => s.move)
  const [editing, setEditing] = useState<Job | 'new' | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<JobStatus | null>(null)

  const column = (s: JobStatus) => jobs.filter((j) => j.status === s).sort((a, b) => a.order - b.order)

  const drop = (status: JobStatus, index: number) => {
    if (dragId) move(dragId, status, index)
    setDragId(null)
    setOverCol(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Application tracker</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Drag cards between columns, or use the status menu on each card.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
          Add job
        </button>
      </div>
      {jobs.length === 0 && (
        <EmptyState title="No applications yet" action={<button type="button" className="btn-primary" onClick={() => setEditing('new')}>Add your first job</button>}>
          Track roles from saved to offer. Tailoring a resume adds a job here automatically.
        </EmptyState>
      )}
      <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-5" role="group" aria-label="Kanban board">
        {JOB_STATUSES.map((status) => {
          const items = column(status)
          return (
            <section
              key={status}
              aria-label={`${JOB_STATUS_LABELS[status]} column`}
              data-testid={`col-${status}`}
              onDragOver={(e) => {
                e.preventDefault()
                setOverCol(status)
              }}
              onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
              onDrop={(e) => {
                e.preventDefault()
                drop(status, items.length)
              }}
              className={`min-h-40 min-w-52 rounded-xl p-2 ${overCol === status ? 'bg-brand-50 ring-2 ring-brand-400 dark:bg-brand-900/30' : 'bg-ink-100 dark:bg-ink-900'}`}
            >
              <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                {JOB_STATUS_LABELS[status]}
                <span className="chip">{items.length}</span>
              </h2>
              <ul className="space-y-2">
                {items.map((j, i) => (
                  <li
                    key={j.id}
                    draggable
                    onDragStart={(e) => {
                      setDragId(j.id)
                      e.dataTransfer?.setData('text/plain', j.id)
                    }}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      drop(status, i)
                    }}
                    className={`card cursor-grab space-y-1.5 p-3 ${dragId === j.id ? 'opacity-50' : ''}`}
                  >
                    <button type="button" className="block w-full text-left" onClick={() => setEditing(j)} aria-label={`Edit ${j.title} at ${j.company}`}>
                      <span className="block text-sm font-semibold">{j.title}</span>
                      <span className="block text-xs text-ink-500 dark:text-ink-400">{j.company}</span>
                    </button>
                    <div className="flex flex-wrap gap-1 text-[11px] text-ink-500 dark:text-ink-400">
                      <span className="chip">{j.date}</span>
                      {j.resumeId && <span className="chip">Resume</span>}
                      {j.coverLetterId && <span className="chip">Letter</span>}
                      {j.notes && <span className="chip">Notes</span>}
                    </div>
                    {j.url && (
                      <a href={j.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs underline">
                        {j.url}
                      </a>
                    )}
                    <label className="sr-only" htmlFor={`status-${j.id}`}>
                      Move {j.title} to
                    </label>
                    <select id={`status-${j.id}`} className="input py-1 text-xs" value={j.status} onChange={(e) => move(j.id, e.target.value as JobStatus, Number.MAX_SAFE_INTEGER)}>
                      {JOB_STATUSES.map((s) => (
                        <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      {editing && <JobModal job={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
