import { z } from 'zod'
import { makeId } from '@/lib/id'
import type { ResumeContent } from '@/types/resume'

export type ChangeStatus = 'pending' | 'accepted' | 'rejected'

export type ChangeTarget =
  | { kind: 'summary' }
  | { kind: 'bullet'; section: 'experience' | 'projects'; entry: number; bullet: number }
  | { kind: 'skills' }

export interface Change {
  id: string
  target: ChangeTarget
  /** Human label such as "Acme Corp - Engineer, bullet 2". */
  label: string
  before: string
  after: string
  /** Only for skills changes: the proposed ordered list, and the list it replaces. */
  afterSkills?: string[]
  beforeSkills?: string[]
  reason: string
  status: ChangeStatus
  /** Truthfulness warnings, e.g. numbers that do not appear in the original resume. */
  warnings: string[]
}

/** The JSON shape the model returns for tailoring and for chat edit suggestions. */
export const ProposedEditsSchema = z.object({
  summary: z.string().nullish(),
  bullets: z
    .array(
      z.object({
        section: z.enum(['experience', 'projects']),
        entry: z.number().int().min(0),
        bullet: z.number().int().min(0),
        text: z.string(),
        reason: z.string().nullish(),
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
  skills: z.array(z.string()).nullish(),
  summaryReason: z.string().nullish(),
  skillsReason: z.string().nullish(),
})
export type ProposedEdits = z.infer<typeof ProposedEditsSchema>

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Numbers/percentages in `after` that appear nowhere in `source`. */
export function findNewNumbers(after: string, source: string): string[] {
  const nums = after.match(/\d[\d,.]*%?/g) ?? []
  const known = new Set((source.match(/\d[\d,.]*%?/g) ?? []).map((n) => n.replace(/[.,]$/, '')))
  return [...new Set(nums.map((n) => n.replace(/[.,]$/, '')).filter((n) => !known.has(n)))]
}

export function getText(content: ResumeContent, target: ChangeTarget): string | undefined {
  switch (target.kind) {
    case 'summary':
      return content.summary
    case 'skills':
      return content.skills.join(', ')
    case 'bullet':
      return content[target.section][target.entry]?.bullets[target.bullet]
  }
}

function labelFor(content: ResumeContent, target: ChangeTarget): string {
  if (target.kind === 'summary') return 'Summary'
  if (target.kind === 'skills') return 'Skills order'
  if (target.section === 'experience') {
    const e = content.experience[target.entry]
    return `${e?.title ?? 'Role'} at ${e?.company ?? ''}, bullet ${target.bullet + 1}`.replace(/ at ,/, ',')
  }
  return `Project ${content.projects[target.entry]?.name ?? ''}, bullet ${target.bullet + 1}`
}

/** Skills: keep only skills the user already has; unmentioned ones are appended in original order. */
export function sanitizeSkills(original: string[], proposed: string[]): string[] {
  const byKey = new Map(original.map((s) => [s.toLowerCase(), s]))
  const out: string[] = []
  for (const p of proposed) {
    const orig = byKey.get(p.trim().toLowerCase())
    if (orig && !out.includes(orig)) out.push(orig)
  }
  for (const s of original) if (!out.includes(s)) out.push(s)
  return out
}

/**
 * Convert model output into reviewable changes. Indexes are resolved against the real resume, so
 * `before` is always the user's actual text. Invalid indexes and no-op edits are dropped.
 */
export function buildChanges(content: ResumeContent, proposed: ProposedEdits, sourceText: string): Change[] {
  const changes: Change[] = []
  const make = (target: ChangeTarget, after: string, reason: string, afterSkills?: string[]) => {
    const before = getText(content, target)
    if (before === undefined || norm(before) === norm(after)) return
    const warnings = findNewNumbers(after, sourceText).map(
      (n) => `"${n}" does not appear in your resume. Only keep it if it is true.`,
    )
    changes.push({
      id: makeId(),
      target,
      label: labelFor(content, target),
      before,
      after: after.trim(),
      afterSkills,
      beforeSkills: afterSkills ? [...content.skills] : undefined,
      reason,
      status: 'pending',
      warnings,
    })
  }

  if (proposed.summary) {
    const reason = proposed.summaryReason ?? (content.summary.trim() ? '' : 'Adds a summary from your existing facts.')
    make({ kind: 'summary' }, proposed.summary, reason)
  }
  const seen = new Set<string>()
  for (const b of proposed.bullets) {
    const key = `${b.section}:${b.entry}:${b.bullet}`
    if (seen.has(key)) continue
    seen.add(key)
    make({ kind: 'bullet', section: b.section, entry: b.entry, bullet: b.bullet }, b.text, b.reason ?? '')
  }
  if (proposed.skills && proposed.skills.length) {
    const ordered = sanitizeSkills(content.skills, proposed.skills)
    make({ kind: 'skills' }, ordered.join(', '), proposed.skillsReason ?? 'Puts the most relevant skills first.', ordered)
  }
  return changes
}

export function setStatus(changes: Change[], id: string, status: ChangeStatus): Change[] {
  return changes.map((c) => (c.id === id ? { ...c, status } : c))
}

export function setAllStatus(changes: Change[], status: ChangeStatus): Change[] {
  return changes.map((c) => ({ ...c, status }))
}

/** True if the resume text a change was based on has since been edited. */
export function isStale(content: ResumeContent, change: Change): boolean {
  const current = getText(content, change.target)
  return current === undefined || norm(current) !== norm(change.before)
}

export interface ApplyResult {
  content: ResumeContent
  applied: string[]
  skipped: string[]
}

/** Apply accepted changes to a copy of the content. Stale changes are skipped, never forced. */
export function applyChanges(content: ResumeContent, changes: Change[]): ApplyResult {
  const next = structuredClone(content)
  const applied: string[] = []
  const skipped: string[] = []
  for (const c of changes) {
    if (c.status !== 'accepted') continue
    if (isStale(next, c)) {
      skipped.push(c.id)
      continue
    }
    const t = c.target
    if (t.kind === 'summary') next.summary = c.after
    else if (t.kind === 'skills') next.skills = c.afterSkills ?? c.after.split(',').map((s) => s.trim())
    else {
      const entry = next[t.section][t.entry]
      if (entry) entry.bullets[t.bullet] = c.after
    }
    applied.push(c.id)
  }
  return { content: next, applied, skipped }
}

/** The change that undoes `change` (swaps before/after). Apply it to revert an accepted change. */
export function invertChange(change: Change): Change {
  return {
    ...change,
    before: change.after,
    after: change.before,
    beforeSkills: change.afterSkills,
    afterSkills: change.beforeSkills,
    status: 'accepted',
  }
}
