import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/ui'
import { useResumeScore } from '@/features/ats/useResumeScore'
import { ResumeEditor } from '@/features/editor/ResumeEditor'
import { DesignPanel } from '@/features/templates/DesignPanel'
import { ResumePreview } from '@/features/templates/ResumePreview'
import { useResumes } from '@/store/resumes'
import type { Resume } from '@/types/resume'
import { ExportBar } from './ExportBar'
import { JobPanel } from './JobPanel'

const TABS = [
  { id: 'edit', label: 'Edit' },
  { id: 'design', label: 'Design' },
  { id: 'job', label: 'Target job' },
] as const
type TabId = (typeof TABS)[number]['id']

export function WorkspacePage() {
  const { id } = useParams()
  const resume = useResumes((s) => s.resumes.find((r) => r.id === id))
  if (!resume) {
    return (
      <EmptyState title="Resume not found" action={<Link to="/" className="btn-primary">Back to resumes</Link>}>
        It may have been deleted, or it lives in another browser.
      </EmptyState>
    )
  }
  return <Workspace key={resume.id} resume={resume} />
}

function Workspace({ resume }: { resume: Resume }) {
  const scoring = useResumeScore(resume)
  const rename = useResumes((s) => s.rename)
  const updateContent = useResumes((s) => s.updateContent)
  const [tab, setTab] = useState<TabId>('edit')

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link to="/" className="btn-ghost btn-sm">
          ← Resumes
        </Link>
        <div className="min-w-48 flex-1">
          <label htmlFor="resume-name" className="sr-only">
            Resume name
          </label>
          <input id="resume-name" className="input max-w-md font-semibold" value={resume.name} onChange={(e) => rename(resume.id, e.target.value)} />
        </div>
        <Link to={`/cover?resume=${resume.id}`} className="btn-secondary btn-sm">
          Write cover letter
        </Link>
        <span className="text-xs text-ink-500 dark:text-ink-400" role="status">
          Saved {new Date(resume.updatedAt).toLocaleTimeString()}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="no-print min-w-0 space-y-4">
          <nav aria-label="Resume tools" className="flex flex-wrap gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t.id ? 'bg-white shadow-sm dark:bg-ink-900' : 'text-ink-600 hover:text-ink-900 dark:text-ink-300'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {tab === 'edit' && <ResumeEditor content={resume.content} onChange={(fn) => updateContent(resume.id, fn)} />}
          {tab === 'design' && <DesignPanel resume={resume} />}
          {tab === 'job' && <JobPanel resume={resume} scoring={scoring} />}
        </div>
        <div className="min-w-0 space-y-3">
          <ExportBar resume={resume} />
          <div className="overflow-x-auto">
            <ResumePreview resume={resume} />
          </div>
        </div>
      </div>
    </div>
  )
}
