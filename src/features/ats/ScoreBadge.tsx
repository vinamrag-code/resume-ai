import { useMemo } from 'react'
import { computeAtsScore } from '@/lib/ats/score'
import type { Resume } from '@/types/resume'

export function scoreTone(value: number): string {
  return value >= 75
    ? 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-100'
    : value >= 50
      ? 'bg-spark-400/25 text-ink-800 dark:text-spark-400'
      : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
}

interface Props {
  /** Pass `score` when it is already computed (workspace); otherwise it is computed from `resume`. */
  resume?: Resume
  score?: number
  onClick?: () => void
}

/** The overall ATS score. */
export function ScoreBadge({ resume, score, onClick }: Props) {
  const computed = useMemo(
    () => (score !== undefined || !resume ? 0 : computeAtsScore({ content: resume.content, jobDescription: resume.target.description }).overall),
    [score, resume],
  )
  const value = score ?? computed
  const cls = `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${scoreTone(value)}`
  const title = 'Overall ATS score: keywords, semantic match, completeness, bullet quality and formatting'
  return onClick ? (
    <button type="button" className={`${cls} hover:opacity-80`} title={title} onClick={onClick}>
      ATS score {value}/100 ›
    </button>
  ) : (
    <span className={cls} title={title}>
      ATS {value}/100
    </span>
  )
}
