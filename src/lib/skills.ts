import { makeId } from '@/lib/id'
import type { ResumeContent, SkillGroup } from '@/types/resume'

type SkillsOf = Pick<ResumeContent, 'skills' | 'skillGroups'>

/** Label for skills that are on the resume but not under any sub-heading. */
export const OTHER_HEADING = 'Other'

const key = (s: string) => s.trim().toLowerCase()

/**
 * The skills as they are shown: one line per sub-heading, in the resume's own wording. `skills` stays the single list of
 * what the person has; the groups only decide where each one is shown, so skills missing from every group are listed
 * under "Other" and groups never show a skill that was deleted from `skills`.
 */
export function groupedSkills(c: SkillsOf): { heading: string; skills: string[] }[] {
  if (!c.skills.length) return []
  if (!c.skillGroups.length) return [{ heading: '', skills: c.skills }]
  const canon = new Map(c.skills.map((s) => [key(s), s]))
  const used = new Set<string>()
  const lines = c.skillGroups.map((g) => ({
    heading: g.heading.trim(),
    skills: g.skills.flatMap((s) => {
      const k = key(s)
      const own = canon.get(k)
      if (!own || used.has(k)) return []
      used.add(k)
      return [own]
    }),
  }))
  const rest = c.skills.filter((s) => !used.has(key(s)))
  return [...lines.filter((l) => l.skills.length), ...(rest.length ? [{ heading: OTHER_HEADING, skills: rest }] : [])]
}

/** The skills as plain lines ("Languages: Python, Go"), for plain text, DOCX and the model. */
export function skillLines(c: SkillsOf): string[] {
  return groupedSkills(c).map((l) => (l.heading ? `${l.heading}: ${l.skills.join(', ')}` : l.skills.join(', ')))
}

/** Drop group members that are no longer in `skills`, and groups left empty. */
export function pruneGroups(groups: SkillGroup[], skills: string[]): SkillGroup[] {
  const have = new Set(skills.map(key))
  return groups.map((g) => ({ ...g, skills: g.skills.filter((s) => have.has(key(s))) })).filter((g) => g.skills.length > 0)
}

/** What the agent's suggestion box shows and the user may edit: grouped lines, or a flat comma list. */
export function skillsText(c: SkillsOf): string {
  if (!c.skillGroups.length) return c.skills.join(', ')
  return groupedSkills(c)
    .map((l) => (l.heading && l.heading !== OTHER_HEADING ? `${l.heading}: ${l.skills.join(', ')}` : l.skills.join(', ')))
    .join('\n')
}

const HEADED = /^([^:,\n]{1,60}):\s*(.*)$/

/** Inverse of skillsText. Lines with "Heading:" become groups; any other line is skills with no sub-heading. */
export function parseSkillsText(text: string): SkillsOf {
  const skills: string[] = []
  const skillGroups: SkillGroup[] = []
  const add = (list: string[]) => list.map((s) => s.trim()).filter(Boolean)
  for (const line of text.split('\n')) {
    const m = HEADED.exec(line.trim())
    const items = add((m ? m[2] ?? '' : line).split(','))
    if (m && items.length) skillGroups.push({ id: makeId(), heading: (m[1] ?? '').trim(), skills: items })
    for (const s of items) if (!skills.some((x) => key(x) === key(s))) skills.push(s)
  }
  return { skills, skillGroups: pruneGroups(skillGroups, skills) }
}
