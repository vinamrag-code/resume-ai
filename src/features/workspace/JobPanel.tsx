import { useState } from 'react'
import { AtsPanel } from '@/features/ats/AtsPanel'
import type { ResumeScore } from '@/features/ats/useResumeScore'
import { TailorPanel } from '@/features/tailor/TailorPanel'
import type { Resume } from '@/types/resume'
import { TargetJobForm } from './TargetJobForm'

export const JOB_TABS = [
  { id: 'ats', label: 'ATS analysis' },
  { id: 'tailor', label: 'Tailor' },
] as const
export type JobTabId = (typeof JOB_TABS)[number]['id']

/** The "Target job" tab: job details are entered once and used by ATS analysis and Tailor (and by the Agent tab). */
export function JobPanel({ resume, scoring }: { resume: Resume; scoring: ResumeScore }) {
  const [tab, setTab] = useState<JobTabId>('ats')
  return (
    <div className="space-y-4">
      <TargetJobForm resume={resume} />
      <nav aria-label="Target job tools" className="flex gap-1 border-b border-ink-200 dark:border-ink-800">
        {JOB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${tab === t.id ? 'border-brand-600 text-brand-800 dark:border-brand-400 dark:text-brand-100' : 'border-transparent text-ink-600 hover:text-ink-900 dark:text-ink-300'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'ats' && <AtsPanel resume={resume} scoring={scoring} />}
      {tab === 'tailor' && <TailorPanel resume={resume} similarity={scoring.similarity} />}
    </div>
  )
}
