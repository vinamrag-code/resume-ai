import { z } from 'zod'
import { findNewTerms } from '@/lib/ats/guards'
import { makeId } from '@/lib/id'
import { parseSkillsText, pruneGroups, skillsText } from '@/lib/skills'
import { HEADER_ALIGNS, TEMPLATE_IDS } from '@/types/resume'
import type { Resume, ResumeContent, SkillGroup } from '@/types/resume'

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

/** Resume sections the assistant may remove (a whole section, or one entry of a list section). */
export const REMOVABLE_SECTIONS = ['summary', 'skills', 'experience', 'education', 'projects', 'certifications'] as const
export type RemovableSection = (typeof REMOVABLE_SECTIONS)[number]
type ListSection = Exclude<RemovableSection, 'summary' | 'skills'>
const isListSection = (s: RemovableSection): s is ListSection => s !== 'summary' && s !== 'skills'

export type ChangeTarget =
  | { kind: 'summary' }
  | { kind: 'bullet'; section: BulletSection; entry: number; bullet: number }
  | { kind: 'bullet-add'; section: BulletSection; entry: number; bullet: number }
  | { kind: 'bullet-remove'; section: BulletSection; entry: number; bullet: number }
  | { kind: 'field'; section: FieldSection; entry: number; field: string }
  /** Remove a whole section, or just one entry of a list section (`entry` set). Undone with 'section-restore'. */
  | { kind: 'section-remove'; section: RemovableSection; entry?: number }
  | { kind: 'section-restore'; section: RemovableSection; entry?: number }
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
  /** Only for skills changes: the sub-headings after and before. */
  afterGroups?: SkillGroup[]
  beforeGroups?: SkillGroup[]
  /** Only for section removals: what was removed, so it can be put back. */
  removed?: unknown
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
  removeSections: z
    .array(z.object({ section: z.enum(REMOVABLE_SECTIONS), entry: idx.nullish(), reason }))
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
  /** The sub-headings to show the skills under (replaces the current ones). Skills must already be on the resume or in addSkills. */
  skillGroups: z.array(z.object({ heading: z.string(), skills: z.array(z.string()) })).nullish(),
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

/** Plain-text view of one entry of a list section, for showing what a removal takes out. */
function describeEntry(content: ResumeContent, section: ListSection, i: number): string | undefined {
  switch (section) {
    case 'experience': {
      const e = content.experience[i]
      return e && [`${e.title}${e.company ? ` at ${e.company}` : ''}${e.start || e.end ? ` (${[e.start, e.end].filter(Boolean).join(' - ')})` : ''}`, ...e.bullets.map((b) => `- ${b}`)].join('\n')
    }
    case 'education': {
      const e = content.education[i]
      return e && [[e.degree, e.field].filter(Boolean).join(', '), e.school, ...e.details.map((d) => `- ${d}`)].filter(Boolean).join('\n')
    }
    case 'projects': {
      const p = content.projects[i]
      return p && [p.name, ...p.bullets.map((b) => `- ${b}`)].join('\n')
    }
    case 'certifications': {
      const c = content.certifications[i]
      return c && [c.name, c.issuer, c.date].filter(Boolean).join(', ')
    }
  }
}

/** What a removal would take out (undefined if there is nothing there). */
function describeSection(content: ResumeContent, section: RemovableSection, entry?: number): string | undefined {
  if (section === 'summary') return content.summary.trim() || undefined
  if (section === 'skills') return content.skills.length ? skillsText(content) : undefined
  if (entry !== undefined) return describeEntry(content, section, entry)
  const all = content[section].map((_, i) => describeEntry(content, section, i)!)
  return all.length ? all.join('\n\n') : undefined
}

/** The data a removal takes out, kept on the change so it can be restored. */
function snapshotSection(content: ResumeContent, section: RemovableSection, entry?: number): unknown {
  if (section === 'summary') return content.summary
  if (section === 'skills') return { skills: content.skills, skillGroups: content.skillGroups }
  return structuredClone(entry !== undefined ? content[section][entry] : content[section])
}

export function getText(content: ResumeContent, target: ChangeTarget): string | undefined {
  switch (target.kind) {
    case 'section-remove':
      return describeSection(content, target.section, target.entry)
    case 'section-restore':
      return ''
    case 'summary':
      return content.summary
    case 'skills':
      return skillsText(content)
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
    case 'section-remove':
    case 'section-restore': {
      const verb = target.kind === 'section-remove' ? 'Remove' : 'Restore'
      if (target.entry === undefined || !isListSection(target.section)) return `${verb} ${target.section === 'summary' ? 'summary' : `${target.section} section`}`
      const name = target.section === 'experience' ? role(target.entry) : target.section === 'projects' ? (content.projects[target.entry]?.name ?? 'project') : `${target.section} ${target.entry + 1}`
      return `${verb} ${name}`
    }
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

/** Proposed sub-headings -> groups of skills the resume really has, each skill under one heading at most. */
export function sanitizeGroups(skills: string[], proposed: { heading: string; skills: string[] }[]): SkillGroup[] {
  const byKey = new Map(skills.map((s) => [s.trim().toLowerCase(), s]))
  const used = new Set<string>()
  const out: SkillGroup[] = []
  for (const g of proposed) {
    const heading = g.heading.trim()
    const own = g.skills.flatMap((s) => {
      const k = s.trim().toLowerCase()
      const skill = byKey.get(k)
      if (!skill || used.has(k)) return []
      used.add(k)
      return [skill]
    })
    if (heading && own.length) out.push({ id: makeId(), heading, skills: own })
  }
  return out
}

/** A new skill order also reorders the skills inside each sub-heading (which is where the order is shown). */
function reorderGroups(groups: SkillGroup[], order: string[]): SkillGroup[] {
  const pos = new Map(order.map((s, i) => [s.toLowerCase(), i]))
  const at = (s: string) => pos.get(s.trim().toLowerCase()) ?? order.length
  return groups.map((g) => ({ ...g, skills: [...g.skills].sort((a, b) => at(a) - at(b)) }))
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
    changes.push({ id: makeId(), target, label: labelFor(content, target), before, after: after.trim(), reason: why, status: 'pending', warnings: target.kind === 'format' || target.kind === 'bullet-remove' || target.kind === 'section-remove' || target.kind === 'section-restore' ? [] : warn(before, after), ...extra })
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
  const removed = new Set<string>()
  for (const r of proposed.removeSections) {
    const entry = isListSection(r.section) ? (r.entry ?? undefined) : undefined
    // A whole-section removal covers every entry removed from it, so only keep one of the two.
    const key = `${r.section}:${entry ?? '*'}`
    if (removed.has(key) || removed.has(`${r.section}:*`)) continue
    const before = describeSection(content, r.section, entry)
    if (before === undefined) continue
    removed.add(key)
    push({ kind: 'section-remove', section: r.section, ...(entry === undefined ? {} : { entry }) }, before, '', r.reason ?? '', { removed: snapshotSection(content, r.section, entry) })
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
  // Models often list a skill the user named only inside a sub-heading and forget "addSkills", so both count (still only if the user wrote it).
  const named = namedSkills(content.skills, [...(proposed.addSkills ?? []), ...(proposed.skillGroups ?? []).flatMap((g) => g.skills)], userText)
  const wantsGroups = (proposed.skillGroups?.length ?? 0) > 0
  if ((proposed.skills && proposed.skills.length) || named.length || wantsGroups) {
    const ordered = [...sanitizeSkills(content.skills, proposed.skills?.length ? proposed.skills : content.skills), ...named]
    const groups = wantsGroups ? sanitizeGroups(ordered, proposed.skillGroups ?? []) : reorderGroups(pruneGroups(content.skillGroups, ordered), ordered)
    const why = named.length ? `Adds ${named.join(', ')}, as you asked.` : (proposed.skillsReason ?? (wantsGroups ? 'Groups your skills under sub-headings.' : 'Puts the most relevant skills first.'))
    make({ kind: 'skills' }, skillsText({ skills: ordered, skillGroups: groups }), why, {
      afterSkills: ordered,
      beforeSkills: [...content.skills],
      afterGroups: groups,
      beforeGroups: structuredClone(content.skillGroups),
      // The user supplied these skills, and a heading is not a claim about experience, so "not in your resume" would mislead.
      ...(named.length || wantsGroups ? { warnings: [] } : {}),
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

/** Where the entry a removal points at is now (found by its id, since earlier removals shift the positions); -1 if gone. */
function removedEntryIndex(content: ResumeContent, target: { section: RemovableSection; entry?: number }, snapshot?: unknown): number {
  if (!isListSection(target.section) || target.entry === undefined) return -1
  const list = content[target.section] as { id: string }[]
  const id = (snapshot as { id?: string } | undefined)?.id
  return id ? list.findIndex((e) => e.id === id) : target.entry < list.length ? target.entry : -1
}

/** True if the resume text a change was based on has since been edited (content changes only). */
export function isStale(content: ResumeContent, change: Change): boolean {
  if (change.target.kind === 'format') return false
  // Removing one entry is tracked by the entry itself, so removing two entries in a row does not shift the second one.
  if (change.target.kind === 'section-remove' && change.target.entry !== undefined) return removedEntryIndex(content, change.target, change.removed) === -1
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

/** Remove a section (or one entry), or put back what `removed` holds. Edits `content` in place. */
function applySectionChange(content: ResumeContent, t: { kind: 'section-remove' | 'section-restore'; section: RemovableSection; entry?: number }, removed: unknown): void {
  const restore = t.kind === 'section-restore'
  if (t.section === 'summary') content.summary = restore ? String(removed ?? '') : ''
  else if (t.section === 'skills') {
    const kept = restore ? (removed as { skills?: string[]; skillGroups?: SkillGroup[] } | undefined) : undefined
    content.skills = kept?.skills ?? []
    content.skillGroups = kept?.skillGroups ?? []
  } else if (t.entry === undefined) {
    ;(content[t.section] as unknown[]) = restore && Array.isArray(removed) ? removed : []
  } else {
    const list = content[t.section] as unknown[]
    if (restore) {
      if (removed) list.splice(Math.min(t.entry, list.length), 0, removed)
    } else {
      const at = removedEntryIndex(content, t, removed)
      if (at !== -1) list.splice(at, 1)
    }
  }
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
    if (t.kind === 'section-remove' || t.kind === 'section-restore') {
      applySectionChange(next, t, c.removed)
      applied.push(c.id)
      continue
    }
    if (t.kind === 'summary') next.summary = c.after
    else if (t.kind === 'skills') {
      const typed = c.afterSkills ? undefined : parseSkillsText(c.after)
      next.skills = c.afterSkills ?? typed?.skills ?? []
      next.skillGroups = c.afterGroups ?? typed?.skillGroups ?? pruneGroups(next.skillGroups, next.skills)
    }
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
  const target: ChangeTarget =
    t.kind === 'bullet-add' ? { ...t, kind: 'bullet-remove' }
    : t.kind === 'bullet-remove' ? { ...t, kind: 'bullet-add' }
    : t.kind === 'section-remove' ? { ...t, kind: 'section-restore' }
    : t.kind === 'section-restore' ? { ...t, kind: 'section-remove' }
    : t
  return { ...change, target, before: change.after, after: change.before, beforeSkills: change.afterSkills, afterSkills: change.beforeSkills, beforeGroups: change.afterGroups, afterGroups: change.beforeGroups, status: 'accepted' }
}
