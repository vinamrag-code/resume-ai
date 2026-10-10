import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState, Modal } from '@/components/ui'
import { ScoreBadge } from '@/features/ats/ScoreBadge'
import { useResumes } from '@/store/resumes'
import type { Resume } from '@/types/resume'

function ResumeCard({ r, base }: { r: Resume; base?: Resume }) {
  const { rename, duplicate, remove } = useResumes()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(r.name)
  const [confirming, setConfirming] = useState(false)
  const commit = () => {
    if (name.trim()) rename(r.id, name.trim())
    else setName(r.name)
    setRenaming(false)
  }
  return (
    <li className="card flex flex-col gap-3">
      <div className="min-w-0">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              commit()
            }}
          >
            <label htmlFor={`rename-${r.id}`} className="sr-only">
              Resume name
            </label>
            <input id={`rename-${r.id}`} className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} onBlur={commit} />
          </form>
        ) : (
          <Link to={`/resume/${r.id}`} className="block truncate text-base font-semibold hover:underline">
            {r.name}
          </Link>
        )}
        <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
          Edited {new Date(r.updatedAt).toLocaleString()}
          {base && <> · Tailored from {base.name}</>}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <ScoreBadge resume={r} />
          {r.content.contact.name && <span className="truncate text-sm">{r.content.contact.name}</span>}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Link to={`/resume/${r.id}`} className="btn-primary btn-sm">
          Open
        </Link>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setRenaming(true)} aria-label={`Rename ${r.name}`}>
          Rename
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => duplicate(r.id)} aria-label={`Duplicate ${r.name}`}>
          Duplicate
        </button>
        <button type="button" className="btn-danger btn-sm" onClick={() => setConfirming(true)} aria-label={`Delete ${r.name}`}>
          Delete
        </button>
      </div>
      {confirming && (
        <Modal title="Delete resume?" onClose={() => setConfirming(false)}>
          <p className="text-sm">
            &ldquo;{r.name}&rdquo; will be permanently removed from this browser. Export a backup in Settings if you might need it.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" onClick={() => remove(r.id)}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </li>
  )
}

export function DashboardPage() {
  const resumes = useResumes((s) => s.resumes)
  const create = useResumes((s) => s.create)
  const navigate = useNavigate()
  const scratch = () => navigate(`/resume/${create('Untitled resume').id}`)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Your resumes</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Analyse, tailor and export. Everything is saved automatically in this browser.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/import" className="btn-primary">
            Import resume
          </Link>
          <button type="button" className="btn-secondary" onClick={scratch}>
            New from scratch
          </button>
        </div>
      </div>
      {resumes.length === 0 ? (
        <EmptyState
          title="No resumes yet"
          action={
            <Link to="/import" className="btn-primary">
              Import your first resume
            </Link>
          }
        >
          Upload a PDF or DOCX, paste text, or start with a blank resume.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {resumes.map((r) => (
            <ResumeCard key={r.id} r={r} base={resumes.find((x) => x.id === r.baseResumeId)} />
          ))}
        </ul>
      )}
    </div>
  )
}
