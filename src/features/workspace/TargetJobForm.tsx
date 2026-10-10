import { useResumes } from '@/store/resumes'
import type { Resume } from '@/types/resume'
import { AreaField, TextField } from '@/features/editor/controls'

/** Job context shared by ATS analysis, tailoring and the resume agent. */
export function TargetJobForm({ resume }: { resume: Resume }) {
  const setTarget = useResumes((s) => s.setTarget)
  const t = resume.target
  return (
    <details className="card" open={!t.description}>
      <summary className="cursor-pointer text-sm font-semibold">Target job {t.title && <span className="font-normal text-ink-500">- {t.title}{t.company ? ` at ${t.company}` : ''}</span>}</summary>
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Job title (optional)" value={t.title} onChange={(v) => setTarget(resume.id, { title: v })} />
          <TextField label="Company (optional)" value={t.company} onChange={(v) => setTarget(resume.id, { company: v })} />
        </div>
        <AreaField label="Job description" rows={6} value={t.description} onChange={(v) => setTarget(resume.id, { description: v })} />
      </div>
    </details>
  )
}
