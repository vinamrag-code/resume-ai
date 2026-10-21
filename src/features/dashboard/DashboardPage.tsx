import { IconCheck, IconFileText, IconLayoutKanban, IconStack2 } from '@tabler/icons-react'
import type { Icon as TablerIcon } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ProgressBar } from '@/components/ui'
import { useAuth } from '@/lib/auth/store'
import { useBank } from '@/store/bank'
import { useCoverLetters } from '@/store/coverLetters'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@/types/job'
import type { JobStatus } from '@/types/job'

const STATUS_BAR: Record<JobStatus, string> = {
  saved: 'bg-ink-400',
  applied: 'bg-brand-400',
  interviewing: 'bg-brand-600',
  offer: 'bg-emerald-500',
  rejected: 'bg-red-400',
}

const when = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function Panel({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const ViewAll = ({ to, label }: { to: string; label: string }) => (
  <Link to={to} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
    {label}
  </Link>
)

function Stat({ to, label, value, hint, icon: Icon }: { to: string; label: string; value: number; hint: string; icon: TablerIcon }) {
  return (
    <Link to={to} className="card group flex items-start gap-3 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md dark:hover:border-brand-500/60">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Icon className="h-5 w-5" stroke={1.8} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="mt-1 text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-ink-500 dark:text-ink-400">{hint}</p>
      </div>
    </Link>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-ink-200 p-4 text-center text-sm text-ink-500 dark:border-ink-700 dark:text-ink-400">{children}</p>
}

/** The home screen: a snapshot of resumes, applications, letters and the experience bank, with the next things to do. */
export function DashboardPage() {
  const resumes = useResumes((s) => s.resumes)
  const create = useResumes((s) => s.create)
  const jobs = useJobs((s) => s.jobs)
  const letters = useCoverLetters((s) => s.letters)
  const bank = useBank((s) => s.items)
  const authName = useAuth((s) => s.user?.name ?? '')
  const navigate = useNavigate()

  const resumeName = resumes.find((r) => r.content.contact.name.trim())?.content.contact.name.trim() ?? ''
  const first = (authName || resumeName).split(/\s+/)[0] ?? ''
  const recentResumes = [...resumes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4)
  const recentJobs = [...jobs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)
  const recentLetters = [...letters].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3)
  const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, jobs.filter((j) => j.status === s).length])) as Record<JobStatus, number>
  const live = jobs.length - counts.rejected
  const interviews = counts.interviewing + counts.offer

  const steps = [
    { done: resumes.length > 0, label: 'Import or create a resume', to: '/import' },
    { done: resumes.some((r) => r.target.description.trim()), label: 'Add a target job to score against', to: resumes[0] ? `/resume/${resumes[0].id}` : '/import' },
    { done: bank.length > 0, label: 'Fill your experience bank', to: '/bank' },
    { done: jobs.length > 0, label: 'Track your first application', to: '/tracker' },
    { done: letters.length > 0, label: 'Write a cover letter', to: '/cover' },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const scratch = () => navigate(`/resume/${create('Untitled resume').id}`)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{first ? `Welcome back, ${first}` : 'Welcome back'}</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Everything about your job search in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/import" className="btn-primary">
            Import resume
          </Link>
          <button type="button" className="btn-secondary" onClick={scratch}>
            New from scratch
          </button>
        </div>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Overview">
        <li>
          <Stat to="/resumes" label="Resumes" value={resumes.length} hint={resumes.length ? `Last edited ${when(recentResumes[0]!.updatedAt)}` : 'None yet'} icon={IconFileText} />
        </li>
        <li>
          <Stat to="/tracker" label="Applications" value={live} hint={`${counts.applied} applied, ${counts.saved} saved`} icon={IconLayoutKanban} />
        </li>
        <li>
          <Stat to="/tracker" label="Interviews and offers" value={interviews} hint={`${counts.offer} offer${counts.offer === 1 ? '' : 's'}`} icon={IconCheck} />
        </li>
        <li>
          <Stat to="/bank" label="Experience bank" value={bank.length} hint={`${letters.length} cover letter${letters.length === 1 ? '' : 's'} written`} icon={IconStack2} />
        </li>
      </ul>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Recent resumes" action={<ViewAll to="/resumes" label="View all" />}>
            {recentResumes.length === 0 ? (
              <Empty>
                No resumes yet. <Link to="/import" className="font-medium text-brand-600 underline dark:text-brand-300">Import your first one</Link>.
              </Empty>
            ) : (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {recentResumes.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link to={`/resume/${r.id}`} className="block truncate text-sm font-medium hover:underline">
                        {r.name}
                      </Link>
                      <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                        Edited {when(r.updatedAt)}
                        {r.target.title && ` · Targeting ${r.target.title}${r.target.company ? ` at ${r.target.company}` : ''}`}
                      </p>
                    </div>
                    <Link to={`/resume/${r.id}`} className="btn-secondary btn-sm shrink-0">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent applications" action={<ViewAll to="/tracker" label="Open tracker" />}>
            {recentJobs.length === 0 ? (
              <Empty>
                Nothing tracked yet. <Link to="/tracker" className="font-medium text-brand-600 underline dark:text-brand-300">Add an application</Link> to follow it from saved to offer.
              </Empty>
            ) : (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {recentJobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{j.title}</p>
                      <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                        {j.company} · {j.date}
                      </p>
                    </div>
                    <span className="chip shrink-0">{JOB_STATUS_LABELS[j.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          {doneCount < steps.length && (
            <Panel title="Getting started">
              <ProgressBar value={(doneCount / steps.length) * 100} label={`${doneCount} of ${steps.length} done`} />
              <ul className="mt-3 space-y-1.5">
                {steps.map((s) => (
                  <li key={s.label}>
                    <Link to={s.to} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-ink-100 dark:hover:bg-ink-800 ${s.done ? 'text-ink-400 line-through dark:text-ink-500' : ''}`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${s.done ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-300 dark:border-ink-600'}`} aria-hidden="true">
                        {s.done ? <IconCheck className="h-3 w-3" stroke={3.5} /> : null}
                      </span>
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Application pipeline">
            {jobs.length === 0 ? (
              <Empty>Your pipeline appears here.</Empty>
            ) : (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800" role="img" aria-label="Applications by status">
                  {JOB_STATUSES.map((s) => (counts[s] ? <span key={s} className={STATUS_BAR[s]} style={{ width: `${(counts[s] / jobs.length) * 100}%` }} /> : null))}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {JOB_STATUSES.map((s) => (
                    <li key={s} className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_BAR[s]}`} aria-hidden="true" />
                        {JOB_STATUS_LABELS[s]}
                      </span>
                      <span className="font-medium">{counts[s]}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>

          <Panel title="Cover letters" action={<ViewAll to="/cover" label="Write one" />}>
            {recentLetters.length === 0 ? (
              <Empty>No cover letters yet.</Empty>
            ) : (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {recentLetters.map((l) => (
                  <li key={l.id} className="py-2">
                    <p className="truncate text-sm font-medium">{l.title || `${l.jobTitle} at ${l.company}`}</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">Edited {when(l.updatedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
