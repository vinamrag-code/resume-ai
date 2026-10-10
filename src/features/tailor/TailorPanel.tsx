import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState, ErrorBanner, Spinner, TruthfulnessNote } from '@/components/ui'
import { applyChanges, setAllStatus, setStatus } from '@/lib/changes'
import type { Change } from '@/lib/changes'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import type { Resume } from '@/types/resume'
import { ChangeCard } from './ChangeCard'
import { proposeTailoring } from './tailorResume'

export function TailorPanel({ resume }: { resume: Resume }) {
  const navigate = useNavigate()
  const [changes, setChanges] = useState<Change[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const abort = useRef<AbortController | null>(null)
  const { title, company, description } = resume.target
  const accepted = changes?.filter((c) => c.status === 'accepted').length ?? 0

  const generate = async () => {
    setLoading(true)
    setError(null)
    setChanges(null)
    abort.current = new AbortController()
    try {
      setChanges(await proposeTailoring(resume, abort.current.signal))
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  const saveCopy = () => {
    if (!changes) return
    const { content } = applyChanges(resume.content, changes)
    const label = company || title || 'job'
    const job = useJobs.getState().add({ title: title || 'Untitled role', company: company || 'Unknown company', description, status: 'saved' })
    const copy = useResumes.getState().createTailoredCopy(resume.id, content, `${resume.name} - ${label}`, job.id)
    if (!copy) return
    useJobs.getState().update(job.id, { resumeId: copy.id })
    navigate(`/resume/${copy.id}`)
  }

  return (
    <div className="space-y-4">
      <TruthfulnessNote />
      <div className="card flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={loading || !description.trim()} onClick={() => void generate()}>
          {loading ? (
            <>
              <Spinner label="Generating" /> Tailoring...
            </>
          ) : changes ? (
            'Regenerate suggestions'
          ) : (
            'Suggest tailored changes'
          )}
        </button>
        {loading && (
          <button type="button" className="btn-ghost" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        )}
        {!description.trim() && <span className="text-sm text-ink-500">Paste a job description above first.</span>}
      </div>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {changes && changes.length === 0 && (
        <EmptyState title="No changes suggested">The model found nothing worth changing, or its suggestions repeated your existing text. Try regenerating.</EmptyState>
      )}

      {changes && changes.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" role="status">
              {accepted} of {changes.length} accepted
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => setChanges(setAllStatus(changes, 'accepted'))}>
                Accept all
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setChanges(setAllStatus(changes, 'rejected'))}>
                Reject all
              </button>
            </div>
          </div>
          <ul className="space-y-3">
            {changes.map((c) => (
              <ChangeCard key={c.id} change={c} onAccept={() => setChanges(setStatus(changes, c.id, 'accepted'))} onReject={() => setChanges(setStatus(changes, c.id, 'rejected'))} />
            ))}
          </ul>
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600 dark:text-ink-300">Saves a new tailored copy and a job in your tracker. This resume stays unchanged.</p>
            <button type="button" className="btn-primary" disabled={accepted === 0} onClick={saveCopy}>
              Save as tailored copy
            </button>
          </div>
        </>
      )}
    </div>
  )
}
