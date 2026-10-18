import { z } from 'zod'
import { findNewTerms } from '@/lib/ats/guards'
import { makeId } from '@/lib/id'
import { HEADER_ALIGNS, TEMPLATE_IDS } from '@/types/resume'
import type { Resume, ResumeContent } from '@/types/resume'

export type ChangeStatus = 'pending' | 'accepted' | 'rejected'

export const FIELD_SECTIONS = ['contact', 'experience', 'education', 'projects', 'certifications'] as const
export type FieldSection = (typeof FIELD_SECTIONS)[number]

/** Text fields the agent may change, per section. */
export const EDITABLE_FIELDS: Record<FieldSection, readonly string[]> = {
  contact: ['name', 'email', 'phone', 'location'],
  experience: ['title', 'company', 'location', 'start', 'end'],
  education: ['school', 'degree', 'field', 'start', 'end'],
  projects: ['name', 'link'],
  certifications: ['name', 'issuer', 'date'],
}

export const FORMAT_KEYS = ['templateId', 'fontSize', 'spacing', 'headerAlign', 'bulletIndent'] as const
export type FormatKey = (typeof FORMAT_KEYS)[number]

type BulletSection = 'experience' | 'projects'

export type ChangeTarget =
  | { kind: 'summary' }
  | { kind: 'bullet'; section: BulletSection; entry: number; bullet: number }
  | { kind: 'bullet-add'; section: BulletSection; entry: number; bullet: number }
  | { kind: 'bullet-remove'; section: BulletSection; entry: number; bullet: number }
  | { kind: 'field'; section: FieldSection; entry: number; field: string }
  | { kind: 'skills' }
  | { kind: 'format'; key: FormatKey }

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

const reason = z.string().nullish()
const idx = z.number().int().min(0)

/** The JSON shape the model returns for tailoring and for chat edit suggestions. */
export const ProposedEditsSchema = z.object({
  summary: z.string().nullish(),
  bullets: z
    .array(z.object({ section: z.enum(['experience', 'projects']), entry: idx, bullet: idx, text: z.string(), reason }))
    .nullish()
    .transform((v) => v ?? []),
  addBullets: z
    .array(z.object({ section: z.enum(['experience', 'projects']), entry: idx, bullet: idx.nullish(), text: z.string(), reason }))
    .nullish()
    .transform((v) => v ?? []),
  removeBullets: z
    .array(z.object({ section: z.enum(['experience', 'projects']), entry: idx, bullet: idx, reason }))
    .nullish()
    .transform((v) => v ?? []),
  fields: z
    .array(z.object({ section: z.enum(FIELD_SECTIONS), entry: idx.nullish(), field: z.string(), value: z.string(), reason }))
    .nullish()
    .transform((v) => v ?? []),
  format: z
    .object({
      templateId: z.enum(TEMPLATE_IDS).nullish(),
      fontSize: z.number().nullish(),
      spacing: z.number().nullish(),
      headerAlign: z.enum(HEADER_ALIGNS).nullish(),
      bulletIndent: z.number().nullish(),
      reason,
    })
    .nullish(),
  skills: z.array(z.string()).nullish(),
  /** Skills the user named themselves; accepted only if they really appear in the user's own messages. */
  addSkills: z.array(z.string()).nullish(),
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

type Format = Pick<Resume, 'templateId'> & Pick<Resume['style'], 'fontSize' | 'spacing' | 'headerAlign' | 'bulletIndent'>

/** What the resume looks like right now, for format changes. */
export function currentFormat(r: Pick<Resume, 'templateId' | 'style'>): Format {
  return { templateId: r.templateId, fontSize: r.style.fontSize, spacing: r.style.spacing, headerAlign: r.style.headerAlign ?? 'auto', bulletIndent: r.style.bulletIndent ?? 1.1 }
}

const entryOf = (content: ResumeContent, section: FieldSection, entry: number): Record<string, unknown> | undefined =>
  section === 'contact' ? (content.contact as unknown as Record<string, unknown>) : (content[section][entry] as unknown as Record<string, unknown> | undefined)

export function getText(content: ResumeContent, target: ChangeTarget): string | undefined {
  switch (target.kind) {
    case 'summary':
      return content.summary
    case 'skills':
      return content.skills.join(', ')
    case 'bullet':
    case 'bullet-remove':
      return content[target.section][target.entry]?.bullets[target.bullet]
    case 'bullet-add':
      return content[target.section][target.entry] ? '' : undefined
    case 'field': {
      const v = entryOf(content, target.section, target.entry)?.[target.field]
      return typeof v === 'string' ? v : undefined
    }
    case 'format':
      return undefined
  }
}

function labelFor(content: ResumeContent, target: ChangeTarget): string {
  const role = (entry: number) => {
    const e = content.experience[entry]
    return e ? `${e.title || 'Role'}${e.company ? ` at ${e.company}` : ''}` : 'Role'
  }
  switch (target.kind) {
    case 'summary':
      return 'Summary'
    case 'skills':
      return 'Skills order'
    case 'format':
      return `Layout: ${{ templateId: 'template', fontSize: 'font size', spacing: 'spacing', headerAlign: 'header alignment', bulletIndent: 'bullet indent' }[target.key]}`
    case 'field':
      return target.section === 'contact' ? `Contact ${target.field}` : `${target.section} ${target.entry + 1}: ${target.field}`
    default: {
      const where = target.section === 'experience' ? role(target.entry) : `Project ${content.projects[target.entry]?.name ?? ''}`.trim()
      const verb = target.kind === 'bullet-add' ? 'new bullet' : target.kind === 'bullet-remove' ? 'remove bullet' : 'bullet'
      return `${where}, ${verb} ${target.bullet + 1}`
    }
  }
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

/** Proposed new skills that the user really wrote in the conversation and the resume does not have yet. */
export function namedSkills(existing: string[], proposed: string[], userText: string): string[] {
  const said = userText.toLowerCase()
  const have = new Set(existing.map((s) => s.trim().toLowerCase()))
  const out: string[] = []
  for (const raw of proposed) {
    const skill = raw.trim()
    const key = skill.toLowerCase()
    if (!skill || have.has(key) || !said.includes(key)) continue
    have.add(key)
    out.push(skill)
  }
  return out
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Convert model output into reviewable changes. Indexes are resolved against the real resume, so
 * `before` is always the user's actual text. Invalid indexes, unknown fields and no-op edits are dropped.
 * Pass `format` (the resume's current layout) to allow layout changes, and `userText` (what the user wrote in the
 * conversation) to allow adding skills they named: the model can never add a skill the user did not mention.
 */
export function buildChanges(content: ResumeContent, proposed: ProposedEdits, sourceText: string, format?: Format, userText = ''): Change[] {
  const changes: Change[] = []
  const warn = (before: string, after: string) => [
    ...findNewNumbers(after, `${sourceText}\n${before}`).map((n) => `"${n}" does not appear in your resume. Only keep it if it is true.`),
    ...findNewTerms(after, `${sourceText}\n${before}`).map((t) => `"${t}" is not mentioned in your resume. Only keep it if it is true.`),
  ]
  const push = (target: ChangeTarget, before: string, after: string, why: string, extra: Partial<Change> = {}) => {
    changes.push({ id: makeId(), target, label: labelFor(content, target), before, after: after.trim(), reason: why, status: 'pending', warnings: target.kind === 'format' || target.kind === 'bullet-remove' ? [] : warn(before, after), ...extra })
  }
  const make = (target: ChangeTarget, after: string, why: string, extra: Partial<Change> = {}) => {
    const before = getText(content, target)
    if (before === undefined || norm(before) === norm(after)) return
    push(target, before, after, why, extra)
  }

  if (proposed.summary) make({ kind: 'summary' }, proposed.summary, proposed.summaryReason ?? (content.summary.trim() ? '' : 'Adds a summary from your existing facts.'))

  const seen = new Set<string>()
  for (const b of proposed.bullets) {
    const key = `${b.section}:${b.entry}:${b.bullet}`
    if (seen.has(key)) continue
    seen.add(key)
    make({ kind: 'bullet', section: b.section, entry: b.entry, bullet: b.bullet }, b.text, b.reason ?? '')
  }
  for (const b of proposed.removeBullets) {
    const key = `${b.section}:${b.entry}:${b.bullet}`
    if (seen.has(key)) continue
    seen.add(key)
    const before = content[b.section][b.entry]?.bullets[b.bullet]
    if (before !== undefined) push({ kind: 'bullet-remove', section: b.section, entry: b.entry, bullet: b.bullet }, before, '', b.reason ?? '')
  }
  for (const b of proposed.addBullets) {
    const entry = content[b.section][b.entry]
    if (!entry || !b.text.trim()) continue
    const at = clamp(b.bullet ?? entry.bullets.length, 0, entry.bullets.length)
    push({ kind: 'bullet-add', section: b.section, entry: b.entry, bullet: at }, '', b.text, b.reason ?? '')
  }
  for (const f of proposed.fields) {
    if (!EDITABLE_FIELDS[f.section].includes(f.field)) continue
    make({ kind: 'field', section: f.section, entry: f.section === 'contact' ? 0 : (f.entry ?? 0), field: f.field }, f.value, f.reason ?? '')
  }
  const named = namedSkills(content.skills, proposed.addSkills ?? [], userText)
  if ((proposed.skills && proposed.skills.length) || named.length) {
    const ordered = [...sanitizeSkills(content.skills, proposed.skills?.length ? proposed.skills : content.skills), ...named]
    make({ kind: 'skills' }, ordered.join(', '), named.length ? `Adds ${named.join(', ')}, as you asked.` : (proposed.skillsReason ?? 'Puts the most relevant skills first.'), {
      afterSkills: ordered,
      beforeSkills: [...content.skills],
      // The user supplied these skills, so "not in your resume" would be a misleading warning.
      ...(named.length ? { warnings: [] } : {}),
    })
  }
  if (format && proposed.format) {
    const f = proposed.format
    const why = f.reason ?? ''
    const add = (key: FormatKey, value: string | number | null | undefined, valid: boolean) => {
      if (value === null || value === undefined || !valid) return
      const before = String(format[key])
      const after = String(value)
      if (before !== after) push({ kind: 'format', key }, before, after, why)
    }
    add('templateId', f.templateId, true)
    add('fontSize', f.fontSize === null || f.fontSize === undefined ? undefined : clamp(f.fontSize, 8, 14), true)
    add('spacing', f.spacing === null || f.spacing === undefined ? undefined : Math.round(clamp(f.spacing, 0.6, 1.6) * 10) / 10, true)
    add('headerAlign', f.headerAlign, true)
    add('bulletIndent', f.bulletIndent === null || f.bulletIndent === undefined ? undefined : Math.round(clamp(f.bulletIndent, 0.5, 3) * 10) / 10, true)
  }
  return changes
}

export function setStatus(changes: Change[], id: string, status: ChangeStatus): Change[] {
  return changes.map((c) => (c.id === id ? { ...c, status } : c))
}

export function setAllStatus(changes: Change[], status: ChangeStatus): Change[] {
  return changes.map((c) => ({ ...c, status }))
}

/** True if the resume text a change was based on has since been edited (content changes only). */
export function isStale(content: ResumeContent, change: Change): boolean {
  if (change.target.kind === 'format') return false
  const current = getText(content, change.target)
  return current === undefined || norm(current) !== norm(change.before)
}

/** Staleness including layout changes, which depend on the whole resume. */
export function isStaleFor(resume: Pick<Resume, 'content' | 'templateId' | 'style'>, change: Change): boolean {
  if (change.target.kind === 'format') return String(currentFormat(resume)[change.target.key]) !== change.before
  return isStale(resume.content, change)
}

export interface ApplyResult {
  content: ResumeContent
  applied: string[]
  skipped: string[]
}

/** Apply accepted content changes to a copy of the content. Stale changes are skipped, never forced. Layout changes are ignored here (see applyFormatChange). */
export function applyChanges(content: ResumeContent, changes: Change[]): ApplyResult {
  const next = structuredClone(content)
  const applied: string[] = []
  const skipped: string[] = []
  for (const c of changes) {
    if (c.status !== 'accepted' || c.target.kind === 'format') continue
    if (isStale(next, c)) {
      skipped.push(c.id)
      continue
    }
    const t = c.target
    if (t.kind === 'summary') next.summary = c.after
    else if (t.kind === 'skills') next.skills = c.afterSkills ?? c.after.split(',').map((s) => s.trim())
    else if (t.kind === 'field') {
      const e = entryOf(next, t.section, t.entry)
      if (e) e[t.field] = c.after
    } else {
      const entry = next[t.section][t.entry]
      if (!entry) continue
      if (t.kind === 'bullet') entry.bullets[t.bullet] = c.after
      else if (t.kind === 'bullet-add') entry.bullets.splice(t.bullet, 0, c.after)
      else entry.bullets.splice(t.bullet, 1)
    }
    applied.push(c.id)
  }
  return { content: next, applied, skipped }
}

/** The template/style patch for an accepted layout change. */
export function formatPatch(change: Change): { templateId?: Resume['templateId']; style?: Partial<Resume['style']> } | null {
  if (change.target.kind !== 'format') return null
  switch (change.target.key) {
    case 'templateId':
      return { templateId: change.after as Resume['templateId'] }
    case 'headerAlign':
      return { style: { headerAlign: change.after as Resume['style']['headerAlign'] } }
    case 'fontSize':
      return { style: { fontSize: Number(change.after) } }
    case 'spacing':
      return { style: { spacing: Number(change.after) } }
    case 'bulletIndent':
      return { style: { bulletIndent: Number(change.after) } }
  }
}

/** The change that undoes `change` (swaps before/after, and add <-> remove). Apply it to revert an accepted change. */
export function invertChange(change: Change): Change {
  const t = change.target
  const target: ChangeTarget = t.kind === 'bullet-add' ? { ...t, kind: 'bullet-remove' } : t.kind === 'bullet-remove' ? { ...t, kind: 'bullet-add' } : t
  return { ...change, target, before: change.after, after: change.before, beforeSkills: change.afterSkills, afterSkills: change.beforeSkills, status: 'accepted' }
}
