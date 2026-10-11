import { useResumes } from '@/store/resumes'
import type { Resume } from '@/types/resume'
import { AreaField, TextField } from '@/features/editor/controls'
import { WORK_TYPES, WORK_TYPE_LABELS } from '@/types/resume'
import type { WorkType } from '@/types/resume'
import { JobUrlImport } from './JobUrlImport'

/** Job context shared by ATS analysis, tailoring and the resume agent. */
export function TargetJobForm({ resume }: { resume: Resume }) {
  const setTarget = useResumes((s) => s.setTarget)
  const t = resume.target
  return (
    <details className="card" open={!t.description}>
      <summary className="cursor-pointer text-sm font-semibold">Target job {t.title && <span className="font-normal text-ink-500">- {t.title}{t.company ? ` at ${t.company}` : ''}{t.location ? `, ${t.location}` : ''}{t.workType !== 'unspecified' ? ` (${WORK_TYPE_LABELS[t.workType]})` : ''}</span>}</summary>
      <div className="mt-3 space-y-3">
        <JobUrlImport
          existingDescription={t.description}
          onImport={(job) =>
            setTarget(resume.id, {
              description: job.description,
              // What the link says replaces the old values; what it does not say leaves yours alone.
              ...(!t.title.trim() && job.title ? { title: job.title } : {}),
              ...(!t.company.trim() && job.company ? { company: job.company } : {}),
              ...(job.location ? { location: job.location } : {}),
              ...(job.workType !== 'unspecified' ? { workType: job.workType } : {}),
            })
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Job title (optional)" value={t.title} onChange={(v) => setTarget(resume.id, { title: v })} />
          <TextField label="Company (optional)" value={t.company} onChange={(v) => setTarget(resume.id, { company: v })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Location (optional)" value={t.location} onChange={(v) => setTarget(resume.id, { location: v })} placeholder="City, State, Country" />
          <div>
            <label htmlFor="target-work-type" className="label">
              Work type
            </label>
            <select id="target-work-type" className="input" value={t.workType} onChange={(e) => setTarget(resume.id, { workType: e.target.value as WorkType })}>
              {WORK_TYPES.map((w) => (
                <option key={w} value={w}>
                  {WORK_TYPE_LABELS[w]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <AreaField label="Job description" rows={6} value={t.description} onChange={(v) => setTarget(resume.id, { description: v })} />
      </div>
    </details>
  )
}
