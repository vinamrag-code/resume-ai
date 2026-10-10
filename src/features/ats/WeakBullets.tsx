import { useState } from 'react'
import { analyzeBullet } from '@/lib/ats/bullets'
import { useResumes } from '@/store/resumes'
import type { Resume } from '@/types/resume'

interface Located {
  section: 'experience' | 'projects'
  entry: number
  index: number
  label: string
  text: string
}

function locate(resume: Resume): Located[] {
  const out: Located[] = []
  resume.content.experience.forEach((e, entry) =>
    e.bullets.forEach((text, index) => out.push({ section: 'experience', entry, index, text, label: `${e.title || 'Role'}${e.company ? ` at ${e.company}` : ''}, bullet ${index + 1}` })),
  )
  resume.content.projects.forEach((p, entry) =>
    p.bullets.forEach((text, index) => out.push({ section: 'projects', entry, index, text, label: `Project ${p.name || entry + 1}, bullet ${index + 1}` })),
  )
  return out.filter((b) => b.text.trim())
}

function Row({ resume, item }: { resume: Resume; item: Located }) {
  const [draft, setDraft] = useState(item.text)
  const live = analyzeBullet(draft)
  const dirty = draft !== item.text
  const save = () =>
    useResumes.getState().updateContent(resume.id, (c) => {
      const entry = c[item.section][item.entry]
      if (entry) entry.bullets[item.index] = draft
      return c
    })
  return (
    <li className="space-y-1.5 rounded-lg border border-ink-200 p-2 dark:border-ink-700">
      <label htmlFor={`weak-${item.section}-${item.entry}-${item.index}`} className="label">
        {item.label}
      </label>
      <textarea id={`weak-${item.section}-${item.entry}-${item.index}`} rows={2} className="input" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-500 dark:text-ink-400" aria-live="polite">
          {live.score}/100{live.issues.length ? ` · ${live.issues.join('; ')}` : ' · looks good'}
        </p>
        <button type="button" className="btn-primary btn-sm" disabled={!dirty || !draft.trim()} onClick={save}>
          Save to resume
        </button>
      </div>
    </li>
  )
}

/** Weak bullets (score < 70) that can be edited in place; saving updates the resume and its preview. */
export function WeakBullets({ resume }: { resume: Resume }) {
  const weak = locate(resume).filter((b) => analyzeBullet(b.text).score < 70)
  if (weak.length === 0) return null
  return (
    <section className="card" aria-label="Bullets to improve">
      <h3 className="mb-2 text-sm font-semibold">Bullets to improve ({weak.length})</h3>
      <p className="mb-2 text-xs text-ink-500 dark:text-ink-400">Edit a bullet here and save it straight into your resume. Only add numbers and facts that are true.</p>
      <ul className="space-y-2">
        {weak.slice(0, 8).map((b) => (
          <Row key={`${b.section}-${b.entry}-${b.index}-${b.text}`} resume={resume} item={b} />
        ))}
      </ul>
    </section>
  )
}
