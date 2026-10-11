import { makeId } from '@/lib/id'
import type { BankDraft } from '@/store/bank'
import type { BankItem } from '@/types/bank'
import type { Experience, Project, ResumeContent } from '@/types/resume'

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean)
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => norm(x) === norm(b[i]!))

export type EntryKind = 'experience' | 'projects'
export type Entry = Experience | Project
const isExperience = (e: Entry): e is Experience => 'company' in e

/** A resume entry made from a bank item. Work becomes an Experience entry; projects and achievements become Project entries. */
export function entryFromItem(item: BankItem, bullets: string[] = item.bullets): { section: EntryKind; entry: Experience | Project } {
  if (item.kind === 'work') {
    return { section: 'experience', entry: { id: makeId(), company: item.org, title: item.title, location: item.location, start: item.start, end: item.end, bullets: [...bullets], bankId: item.id } }
  }
  return { section: 'projects', entry: { id: makeId(), name: item.title, link: item.link, bullets: [...bullets], bankId: item.id } }
}

/** Does this entry still say the same thing as its bank item? */
export function inSync(entry: Entry, item: BankItem): boolean {
  if (isExperience(entry)) {
    return item.kind === 'work' && norm(entry.title) === norm(item.title) && norm(entry.company) === norm(item.org) && norm(entry.location) === norm(item.location) && norm(entry.start) === norm(item.start) && norm(entry.end) === norm(item.end) && sameList(clean(entry.bullets), clean(item.bullets))
  }
  return item.kind !== 'work' && norm(entry.name) === norm(item.title) && norm(entry.link) === norm(item.link) && sameList(clean(entry.bullets), clean(item.bullets))
}

/** Replace the entry's text with the bank item's (the entry keeps its place and id in the resume). */
export function pullFromBank<T extends Entry>(entry: T, item: BankItem): T {
  const fresh = entryFromItem(item).entry
  return { ...fresh, id: entry.id, bankId: item.id } as T
}

/** What to write into the bank item so it matches the entry. */
export function pushToBank(entry: Entry): Partial<BankDraft> {
  if (isExperience(entry)) return { title: entry.title.trim(), org: entry.company.trim(), location: entry.location.trim(), start: entry.start.trim(), end: entry.end.trim(), bullets: clean(entry.bullets) }
  return { title: entry.name.trim(), link: entry.link.trim(), bullets: clean(entry.bullets) }
}

/** A new bank draft from an entry that is not in the bank yet. */
export function draftFromEntry(entry: Entry): BankDraft {
  return isExperience(entry)
    ? { kind: 'work', title: '', org: '', location: '', start: '', end: '', link: '', bullets: [], skills: [], ...pushToBank(entry) }
    : { kind: 'project', title: '', org: '', location: '', start: '', end: '', link: '', bullets: [], skills: [], ...pushToBank(entry) }
}

/** Link entries that have no link yet to the bank item with the same title and organisation (never overwrites a link). */
export function linkEntries(content: ResumeContent, items: BankItem[]): { content: ResumeContent; linked: number } {
  let linked = 0
  const find = (kind: 'work' | 'project', title: string, org: string) => items.find((i) => (kind === 'work' ? i.kind === 'work' : i.kind !== 'work') && norm(i.title) === norm(title) && (kind === 'project' || norm(i.org) === norm(org)))
  const experience = content.experience.map((e) => {
    const hit = e.bankId ? undefined : find('work', e.title, e.company)
    if (!hit) return e
    linked++
    return { ...e, bankId: hit.id }
  })
  const projects = content.projects.map((p) => {
    const hit = p.bankId ? undefined : find('project', p.name, '')
    if (!hit) return p
    linked++
    return { ...p, bankId: hit.id }
  })
  return { content: { ...content, experience, projects }, linked }
}
