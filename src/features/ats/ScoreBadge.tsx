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

/** Live ATS score (rule-based, without the optional semantic part). */
export function ScoreBadge({ resume }: { resume: Resume }) {
  const score = useMemo(
    () => computeAtsScore({ content: resume.content, jobDescription: resume.target.description }).overall,
    [resume.content, resume.target.description],
  )
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${scoreTone(score)}`} title="ATS score: keywords, completeness, bullet quality and formatting">
      ATS {score}/100
    </span>
  )
}
