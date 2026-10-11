import { extractKeywords, matchKeywords } from '@/lib/ats/keywords'
import { makeId } from '@/lib/id'
import { emptyContent } from '@/lib/resume'
import type { BankItem } from '@/types/bank'
import type { ResumeContent } from '@/types/resume'
import type { BankDraft } from '@/store/bank'

export interface Pick {
  item: BankItem
  /** The bullets to include (already chosen from the item's own bullets). */
  bullets: string[]
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Sort key for "Jan 2024", "2023", "03/2022", "Present"... Newest first. Unknown dates sort last. */
export function dateValue(text: string): number {
  const t = text.trim().toLowerCase()
  if (!t) return -1
  if (/present|current|now|ongoing|today/.test(t)) return Number.MAX_SAFE_INTEGER
  const year = t.match(/(19|20)\d{2}/)
  if (!year) return -1
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const named = months.findIndex((m) => t.includes(m))
  const numeric = t.match(/(?:^|\D)(\d{1,2})[/-](?:19|20)\d{2}/)
  const month = named >= 0 ? named : numeric ? Math.min(11, Math.max(0, Number(numeric[1]) - 1)) : 0
  return Number(year[0]) * 12 + month
}

/**
 * Build resume content from the chosen bank items. Contact details, education, certifications and summary come from
 * the base resume; experience, projects and skills come from the bank. Nothing is written by an AI: every line is the
 * user's own text, so nothing can be invented.
 *  - work items become Experience entries, newest first (relevance decided which ones made the cut)
 *  - project items become Project entries, most relevant first
 *  - an achievement is added as a bullet under the work/project it names (matching company or project name);
 *    otherwise it becomes its own entry in Projects
 */
export function assembleContent(base: ResumeContent | undefined, picks: Pick[], jobText: string): ResumeContent {
  const out: ResumeContent = structuredClone(base ?? emptyContent())
  const work = picks.filter((p) => p.item.kind === 'work')
  const projects = picks.filter((p) => p.item.kind === 'project')
  const achievements = picks.filter((p) => p.item.kind === 'achievement')

  const experience = [...work]
    .sort((a, b) => dateValue(b.item.end || b.item.start) - dateValue(a.item.end || a.item.start) || dateValue(b.item.start) - dateValue(a.item.start))
    .map((p) => ({ id: makeId(), company: p.item.org, title: p.item.title, location: p.item.location, start: p.item.start, end: p.item.end, bullets: [...p.bullets] }))
  const projectEntries = projects.map((p) => ({ id: makeId(), name: p.item.title, link: p.item.link, bullets: [...p.bullets] }))

  for (const a of achievements) {
    const key = norm(a.item.org)
    const host = key ? [...experience.filter((e) => norm(e.company) === key), ...projectEntries.filter((e) => norm(e.name) === key)][0] : undefined
    if (host) host.bullets.push(...a.bullets)
    else projectEntries.push({ id: makeId(), name: a.item.title, link: a.item.link, bullets: [...a.bullets] })
  }
  out.experience = experience
  out.projects = projectEntries

  // Skills: the resume's own skills plus those written on the chosen items, the ones the job asks for first.
  const seen = new Set<string>()
  const skills: string[] = []
  for (const s of [...out.skills, ...picks.flatMap((p) => p.item.skills)]) {
    const k = norm(s)
    if (k && !seen.has(k)) {
      seen.add(k)
      skills.push(s.trim())
    }
  }
  const keywords = extractKeywords(jobText, 40)
  const wanted = (s: string) => (matchKeywords(keywords, s).matched.length > 0 ? 1 : 0)
  out.skills = skills.map((s, i) => ({ s, i })).sort((a, b) => wanted(b.s) - wanted(a.s) || a.i - b.i).map((x) => x.s)
  return out
}

const nonEmpty = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean)

/** Turn the entries of a resume into bank drafts, skipping ones already in the bank (same kind, title and organisation). */
export function bankDraftsFromResume(content: ResumeContent, existing: BankItem[]): BankDraft[] {
  const have = new Set(existing.map((i) => `${i.kind}|${norm(i.title)}|${norm(i.org)}`))
  const out: BankDraft[] = []
  const push = (d: BankDraft) => {
    const key = `${d.kind}|${norm(d.title)}|${norm(d.org)}`
    if (!d.title.trim() || have.has(key)) return
    have.add(key)
    out.push(d)
  }
  for (const e of content.experience) {
    push({ kind: 'work', title: e.title, org: e.company, location: e.location, start: e.start, end: e.end, link: '', bullets: nonEmpty(e.bullets), skills: [] })
  }
  for (const p of content.projects) {
    push({ kind: 'project', title: p.name, org: '', location: '', start: '', end: '', link: p.link, bullets: nonEmpty(p.bullets), skills: [] })
  }
  return out
}

/** A skills field typed as free text (comma, semicolon or line separated) -> a clean list without duplicates. */
export function parseSkills(text: string): string[] {
  const seen = new Set<string>()
  return text
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter((s) => {
      const k = norm(s)
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
}

