import { IconArrowRight } from '@tabler/icons-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SignInNotice } from '@/components/SignInNotice'
import { EmptyState, ErrorBanner, Spinner, TruthfulnessNote } from '@/components/ui'
import { useAiAccess } from '@/lib/auth/useAiAccess'
import { scoreTone } from '@/features/ats/scoreTone'
import { computeAtsScore } from '@/lib/ats/score'
import { applyChanges, invertChange, isStale, setAllStatus, setStatus } from '@/lib/changes'
import type { Change } from '@/lib/changes'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import type { Resume } from '@/types/resume'
import { ChangeCard } from './ChangeCard'
import { proposeTailoring } from './tailorResume'

type Mode = 'edit' | 'copy'

export function TailorPanel({ resume, similarity }: { resume: Resume; similarity?: number }) {
  const navigate = useNavigate()
  const [changes, setChanges] = useState<Change[] | null>(null)
  const aiAllowed = useAiAccess()
  const [mode, setMode] = useState<Mode>('edit')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [baseline, setBaseline] = useState<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  const { title, company, description } = resume.target
  const accepted = changes?.filter((c) => c.status === 'accepted').length ?? 0
  const pending = changes?.filter((c) => c.status === 'pending') ?? []

  const scoreOf = (content: Resume['content']) => computeAtsScore({ content, jobDescription: description, semanticSimilarity: similarity }).overall
  const current = useMemo(() => scoreOf(resume.content), [resume.content, description, similarity]) // eslint-disable-line react-hooks/exhaustive-deps
  // Score if every undecided change were accepted too (edit mode) or all accepted changes (copy mode).
  const projected = useMemo(() => {
    if (!changes) return current
    const pool = changes.map((c) => (c.status === 'pending' ? { ...c, status: 'accepted' as const } : c))
    return scoreOf(applyChanges(resume.content, mode === 'edit' ? pool : pool.filter((c) => c.status === 'accepted')).content)
  }, [changes, resume.content, mode, current, similarity]) // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setLoading(true)
    setError(null)
    setChanges(null)
    abort.current = new AbortController()
    try {
      setBaseline(current)
      setChanges(await proposeTailoring(resume, abort.current.signal))
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  /** Edit mode: write one change into this resume right away. */
  const applyNow = (list: Change[], ids: string[]) => {
    const toApply = list.filter((c) => ids.includes(c.id)).map((c) => ({ ...c, status: 'accepted' as const }))
    const res = applyChanges(resume.content, toApply)
    useResumes.getState().setContent(resume.id, res.content)
    return list.map((c) => (res.applied.includes(c.id) ? { ...c, status: 'accepted' as const } : res.skipped.includes(c.id) ? { ...c, status: 'rejected' as const } : c))
  }

  const accept = (id: string) => {
    if (!changes) return
    setChanges(mode === 'edit' ? applyNow(changes, [id]) : setStatus(changes, id, 'accepted'))
  }
  const reject = (id: string) => {
    if (!changes) return
    const c = changes.find((x) => x.id === id)
    if (mode === 'edit' && c?.status === 'accepted') undo(c)
    setChanges(setStatus(changes, id, 'rejected'))
  }
  const undo = (c: Change) => {
    const live = useResumes.getState().resumes.find((r) => r.id === resume.id)
    if (!live) return
    useResumes.getState().setContent(resume.id, applyChanges(live.content, [invertChange(c)]).content)
  }
  const acceptAll = () => {
    if (!changes) return
    setChanges(mode === 'edit' ? applyNow(changes, pending.map((c) => c.id)) : setAllStatus(changes, 'accepted'))
  }
  const rejectAll = () => {
    if (!changes) return
    // In edit mode, already-applied changes stay applied; only undecided ones are rejected.
    setChanges(changes.map((c) => (c.status === 'pending' || mode === 'copy' ? { ...c, status: 'rejected' as const } : c)))
  }
  const undoOne = (c: Change) => {
    undo(c)
    setChanges((cs) => (cs ? setStatus(cs, c.id, 'pending') : cs))
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
      <SignInNotice feature="tailoring" />
      <div className="card space-y-3">
        <fieldset>
          <legend className="label">When I accept a change</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="tailor-mode" checked={mode === 'edit'} onChange={() => setMode('edit')} /> Edit this resume (undo available)
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="tailor-mode" checked={mode === 'copy'} onChange={() => setMode('copy')} /> Save as a new tailored copy
            </label>
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={loading || !aiAllowed || !description.trim()} onClick={() => void generate()}>
            {loading ? (
              <>
                <Spinner label="Generating" /> Analysing job...
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
          {!description.trim() && <span className="text-sm text-ink-500">Add a job title and description above first.</span>}
        </div>
      </div>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {changes && (
        <div className="card flex flex-wrap items-center gap-3 text-sm" aria-label="Score impact">
          <span className="font-semibold">Overall ATS score</span>
          {baseline !== null && <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreTone(baseline)}`}>Before {baseline}</span>}
          <IconArrowRight className="h-4 w-4" stroke={2} aria-hidden="true" />
          <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreTone(current)}`}>Now {current}</span>
          {pending.length > 0 && <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreTone(projected)}`}>If all accepted {projected}</span>}
        </div>
      )}

      {changes && changes.length === 0 && (
        <EmptyState title="No changes suggested">The model found nothing worth changing, or its suggestions repeated your existing text. Try regenerating.</EmptyState>
      )}

      {changes && changes.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" role="status">
              {accepted} of {changes.length} accepted{mode === 'edit' && accepted > 0 ? ' and applied to your resume' : ''}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={acceptAll} disabled={pending.length === 0 && mode === 'edit'}>
                Accept all
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={rejectAll}>
                Reject all
              </button>
            </div>
          </div>
          <ul className="space-y-3">
            {changes.map((c) => (
              <ChangeCard
                key={c.id}
                change={c}
                applied={mode === 'edit' && c.status === 'accepted'}
                outdated={c.status === 'pending' && isStale(resume.content, c)}
                onAccept={() => accept(c.id)}
                onReject={() => reject(c.id)}
                onUndo={() => undoOne(c)}
              />
            ))}
          </ul>
          {mode === 'copy' && (
            <div className="card flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-600 dark:text-ink-300">Saves a new tailored copy and a job in your tracker. This resume stays unchanged.</p>
              <button type="button" className="btn-primary" disabled={accepted === 0} onClick={saveCopy}>
                Save as tailored copy
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
