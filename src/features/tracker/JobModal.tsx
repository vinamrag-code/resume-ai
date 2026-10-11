import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '@/components/ui'
import { AreaField, TextField } from '@/features/editor/controls'
import { JobUrlImport } from '@/features/workspace/JobUrlImport'
import { useCoverLetters } from '@/store/coverLetters'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@/types/job'
import type { Job, JobStatus } from '@/types/job'

/** Create (job undefined) or edit a tracked job. */
export function JobModal({ job, onClose }: { job?: Job; onClose: () => void }) {
  const resumes = useResumes((s) => s.resumes)
  const letters = useCoverLetters((s) => s.letters)
  const [draft, setDraft] = useState({
    title: job?.title ?? '',
    company: job?.company ?? '',
    url: job?.url ?? '',
    date: job?.date ?? new Date().toISOString().slice(0, 10),
    status: (job?.status ?? 'saved') as JobStatus,
    notes: job?.notes ?? '',
    description: job?.description ?? '',
    resumeId: job?.resumeId ?? '',
    coverLetterId: job?.coverLetterId ?? '',
  })
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const valid = draft.title.trim() && draft.company.trim()

  const save = () => {
    const patch = { ...draft, title: draft.title.trim(), company: draft.company.trim(), resumeId: draft.resumeId || undefined, coverLetterId: draft.coverLetterId || undefined }
    const { add, update, move } = useJobs.getState()
    if (job) {
      update(job.id, patch)
      if (patch.status !== job.status) move(job.id, patch.status, Number.MAX_SAFE_INTEGER)
    } else add(patch)
    onClose()
  }

  return (
    <Modal title={job ? 'Edit job' : 'Add job'} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) save()
        }}
      >
        <JobUrlImport
          initialUrl={draft.url}
          existingDescription={draft.description}
          onImport={(job, url) =>
            setDraft((d) => ({ ...d, url, description: job.description, title: d.title.trim() ? d.title : job.title, company: d.company.trim() ? d.company : job.company }))
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Job title" value={draft.title} onChange={(v) => set('title', v)} />
          <TextField label="Company" value={draft.company} onChange={(v) => set('company', v)} />
          <TextField label="Link" type="url" value={draft.url} onChange={(v) => set('url', v)} placeholder="https://" />
          <TextField label="Date" type="date" value={draft.date} onChange={(v) => set('date', v)} />
        </div>
        <div>
          <label htmlFor="job-status" className="label">Status</label>
          <select id="job-status" className="input" value={draft.status} onChange={(e) => set('status', e.target.value as JobStatus)}>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="job-resume" className="label">Tailored resume</label>
            <select id="job-resume" className="input" value={draft.resumeId} onChange={(e) => set('resumeId', e.target.value)}>
              <option value="">None</option>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="job-letter" className="label">Cover letter</label>
            <select id="job-letter" className="input" value={draft.coverLetterId} onChange={(e) => set('coverLetterId', e.target.value)}>
              <option value="">None</option>
              {letters.map((l) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 text-sm">
          {draft.resumeId && <Link className="underline" to={`/resume/${draft.resumeId}`} onClick={onClose}>Open resume</Link>}
          {draft.coverLetterId && <Link className="underline" to={`/cover?id=${draft.coverLetterId}`} onClick={onClose}>Open cover letter</Link>}
        </div>
        <AreaField label="Notes" rows={3} value={draft.notes} onChange={(v) => set('notes', v)} />
        <AreaField label="Job description" rows={4} value={draft.description} onChange={(v) => set('description', v)} />
        <div className="flex items-center justify-between gap-2 pt-1">
          {job ? (
            <button type="button" className="btn-danger" onClick={() => { useJobs.getState().remove(job.id); onClose() }}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!valid}>Save</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
