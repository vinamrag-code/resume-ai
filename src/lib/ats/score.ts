import { extractKeywords, matchKeywords } from './keywords'
import type { Keyword } from './keywords'
import { analyzeBullet } from './bullets'
import type { BulletAnalysis } from './bullets'
import { similarityToScore } from './embeddings'
import { resumeToText } from '@/lib/resume'
import type { ResumeContent } from '@/types/resume'

export type ComponentId = 'keywords' | 'semantic' | 'completeness' | 'bullets' | 'formatting'

export interface ScoreComponent {
  id: ComponentId
  label: string
  /** 0..100 */
  score: number
  /** Share of the overall score, after redistributing weight from components that were not computed. */
  weight: number
  summary: string
}

export interface Check {
  label: string
  passed: boolean
  fix?: string
}

export interface AtsReport {
  overall: number
  components: ScoreComponent[]
  matchedKeywords: Keyword[]
  missingKeywords: Keyword[]
  weakBullets: BulletAnalysis[]
  completeness: Check[]
  formatting: Check[]
  fixes: string[]
  hasJobDescription: boolean
  /** True when a job description exists but no embedding similarity was supplied. */
  semanticPending: boolean
}

/** Base weights; unavailable components are dropped and the rest renormalised. */
export const BASE_WEIGHTS: Record<ComponentId, number> = {
  keywords: 0.3,
  semantic: 0.2,
  completeness: 0.15,
  bullets: 0.2,
  formatting: 0.15,
}

const pct = (checks: Check[]) => (checks.length ? Math.round((checks.filter((c) => c.passed).length / checks.length) * 100) : 0)

export function completenessChecks(c: ResumeContent): Check[] {
  const { contact } = c
  return [
    { label: 'Name', passed: !!contact.name.trim(), fix: 'Add your full name.' },
    { label: 'Email', passed: !!contact.email.trim(), fix: 'Add an email address recruiters can reply to.' },
    { label: 'Phone', passed: !!contact.phone.trim(), fix: 'Add a phone number.' },
    { label: 'Location', passed: !!contact.location.trim(), fix: 'Add your city or region.' },
    { label: 'Summary', passed: c.summary.trim().split(/\s+/).filter(Boolean).length >= 15, fix: 'Write a 2-3 sentence summary (15+ words) of your focus and strengths.' },
    { label: 'Work experience', passed: c.experience.length > 0, fix: 'Add at least one role, internship or relevant experience.' },
    {
      label: 'At least 2 bullets per role',
      passed: c.experience.length > 0 && c.experience.every((e) => e.bullets.filter((b) => b.trim()).length >= 2),
      fix: 'Give every role at least two bullets describing what you did and achieved.',
    },
    { label: 'Education', passed: c.education.length > 0, fix: 'Add your education.' },
    { label: 'Skills (5+)', passed: c.skills.length >= 5, fix: 'List at least five relevant skills you actually have.' },
  ]
}

const SPECIAL_GLYPHS = /[←-⇿─-➿\u{1F300}-\u{1FAFF}�]/u

export function formattingChecks(c: ResumeContent): Check[] {
  const text = resumeToText(c)
  const words = text.split(/\s+/).filter(Boolean).length
  const bullets = [...c.experience.flatMap((e) => e.bullets), ...c.projects.flatMap((p) => p.bullets)].filter((b) => b.trim())
  return [
    {
      label: 'Valid email format',
      passed: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contact.email.trim()),
      fix: 'Use a plain, valid email address (name@domain.com).',
    },
    {
      label: 'Dates on every role',
      passed: c.experience.every((e) => e.start.trim() && e.end.trim()),
      fix: 'Add start and end dates (e.g. "Jun 2022" - "Present") to every role.',
    },
    {
      label: 'Consistent date style',
      passed: new Set(c.experience.flatMap((e) => [e.start, e.end]).filter((d) => /\d/.test(d)).map((d) => (/^[A-Za-z]/.test(d) ? 'month-year' : /^\d{4}$/.test(d) ? 'year' : 'numeric'))).size <= 1,
      fix: 'Use one date format throughout (e.g. "Jun 2022").',
    },
    { label: 'No icons or special symbols', passed: !SPECIAL_GLYPHS.test(text), fix: 'Remove emoji, arrows and decorative symbols; parsers often garble them.' },
    {
      label: 'Reasonable length (250-1000 words)',
      passed: words >= 250 && words <= 1000,
      fix: words < 250 ? 'Your resume is very short; add detail about impact.' : 'Trim to the most relevant content (aim for one or two pages).',
    },
    { label: 'No overly long bullets', passed: bullets.every((b) => b.split(/\s+/).length <= 40), fix: 'Split bullets longer than 40 words.' },
    { label: 'Not too many bullets per role (8 max)', passed: c.experience.every((e) => e.bullets.length <= 8), fix: 'Keep each role to your 3-6 strongest bullets.' },
  ]
}

export interface ScoreInput {
  content: ResumeContent
  jobDescription?: string
  /** Cosine similarity from embeddings, when available. */
  semanticSimilarity?: number
}

/** Deterministic ATS score. The LLM is never consulted here. */
export function computeAtsScore({ content, jobDescription, semanticSimilarity }: ScoreInput): AtsReport {
  const jd = jobDescription?.trim() ?? ''
  const hasJd = jd.length > 0
  const text = resumeToText(content)
  const parts: Omit<ScoreComponent, 'weight'>[] = []
  const fixes: string[] = []

  let matched: Keyword[] = []
  let missing: Keyword[] = []
  if (hasJd) {
    const kws = extractKeywords(jd)
    const m = matchKeywords(kws, text)
    matched = m.matched
    missing = m.missing
    parts.push({
      id: 'keywords',
      label: 'Keyword coverage',
      score: Math.round(m.coverage * 100),
      summary: `${matched.length} of ${kws.length} job keywords found in your resume.`,
    })
    for (const k of missing.slice(0, 8)) {
      fixes.push(`If it is true for you, work "${k.term}" into a relevant bullet or your skills list.`)
    }
  }
  const semanticPending = hasJd && semanticSimilarity === undefined
  if (hasJd && semanticSimilarity !== undefined) {
    parts.push({
      id: 'semantic',
      label: 'Semantic similarity',
      score: similarityToScore(semanticSimilarity),
      summary: `Embedding similarity to the job description: ${semanticSimilarity.toFixed(2)}.`,
    })
  }

  const completeness = completenessChecks(content)
  parts.push({
    id: 'completeness',
    label: 'Section completeness',
    score: pct(completeness),
    summary: `${completeness.filter((c) => c.passed).length} of ${completeness.length} checks passed.`,
  })
  for (const c of completeness) if (!c.passed && c.fix) fixes.push(c.fix)

  const allBullets = [...content.experience.flatMap((e) => e.bullets), ...content.projects.flatMap((p) => p.bullets)]
    .filter((b) => b.trim())
    .map(analyzeBullet)
  const bulletScore = allBullets.length ? Math.round(allBullets.reduce((s, b) => s + b.score, 0) / allBullets.length) : 0
  const weakBullets = allBullets.filter((b) => b.score < 70).sort((a, b) => a.score - b.score)
  const withVerb = allBullets.filter((b) => b.startsWithVerb).length
  const withMetric = allBullets.filter((b) => b.hasMetric).length
  parts.push({
    id: 'bullets',
    label: 'Bullet quality',
    score: bulletScore,
    summary: allBullets.length
      ? `${withVerb}/${allBullets.length} start with an action verb, ${withMetric}/${allBullets.length} are quantified.`
      : 'No bullets to analyse yet.',
  })
  if (allBullets.length && withMetric < allBullets.length / 2) fixes.push('Quantify more bullets (numbers, percentages, scale), using only figures that are true.')
  if (allBullets.length && withVerb < allBullets.length * 0.8) fixes.push('Start more bullets with action verbs such as "Built", "Led" or "Reduced".')

  const formatting = formattingChecks(content)
  parts.push({
    id: 'formatting',
    label: 'Formatting checks',
    score: pct(formatting),
    summary: `${formatting.filter((c) => c.passed).length} of ${formatting.length} checks passed. Templates are single-column and parser-safe.`,
  })
  for (const c of formatting) if (!c.passed && c.fix) fixes.push(c.fix)

  const totalWeight = parts.reduce((s, p) => s + BASE_WEIGHTS[p.id], 0)
  const components: ScoreComponent[] = parts.map((p) => ({ ...p, weight: BASE_WEIGHTS[p.id] / totalWeight }))
  const overall = Math.round(components.reduce((s, c) => s + c.score * c.weight, 0))

  return {
    overall,
    components,
    matchedKeywords: matched,
    missingKeywords: missing,
    weakBullets,
    completeness,
    formatting,
    fixes: [...new Set(fixes)],
    hasJobDescription: hasJd,
    semanticPending,
  }
}
