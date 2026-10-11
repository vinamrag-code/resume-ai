import { describe, expect, it } from 'vitest'
import { mockLlm } from '@/test/helpers'
import { sampleContent } from '@/test/fixtures'
import type { BankItem } from '@/types/bank'
import { buildWithAi, unsupported } from './aiBuild'
import { draftFromEntry, entryFromItem, inSync, linkEntries, pullFromBank, pushToBank } from './link'

const item = (over: Partial<BankItem> & Pick<BankItem, 'id' | 'kind' | 'title'>): BankItem => ({ org: '', location: '', start: '', end: '', link: '', bullets: [], skills: [], createdAt: 1, ...over })
const work = item({ id: 'w1', kind: 'work', title: 'Frontend Developer', org: 'Acme', start: 'Jan 2022', end: 'Present', bullets: ['Built dashboards in React used by the team', 'Cut page load time by 40%', 'Mentored two interns'], skills: ['React'] })
const proj = item({ id: 'p1', kind: 'project', title: 'Habit tracker', bullets: ['Built a habit tracker in Firebase'], skills: ['Firebase'] })

describe('linking resume entries to the bank', () => {
  it('makes entries that remember their bank item', () => {
    const { section, entry } = entryFromItem(work)
    expect(section).toBe('experience')
    expect(entry).toMatchObject({ bankId: 'w1', company: 'Acme', title: 'Frontend Developer', bullets: work.bullets })
    expect(entryFromItem(proj)).toMatchObject({ section: 'projects', entry: { bankId: 'p1', name: 'Habit tracker' } })
    expect(entryFromItem(item({ id: 'a', kind: 'achievement', title: 'Won a hackathon', bullets: ['x'] })).section).toBe('projects')
  })

  it('detects edits on either side and syncs in both directions', () => {
    const { entry } = entryFromItem(work)
    expect(inSync(entry, work)).toBe(true)
    const edited = { ...entry, bullets: ['Built dashboards in React used by the team', 'Cut page load time by 55%'] }
    expect(inSync(edited, work)).toBe(false)
    // resume -> bank
    expect(pushToBank(edited)).toMatchObject({ title: 'Frontend Developer', org: 'Acme', bullets: edited.bullets })
    // bank -> resume (the entry keeps its id and link)
    const pulled = pullFromBank(edited, work)
    expect(pulled).toMatchObject({ id: edited.id, bankId: 'w1', bullets: work.bullets })
    expect(inSync(pulled, work)).toBe(true)
    // whitespace and case are not differences
    expect(inSync({ ...entry, title: '  frontend developer ' }, work)).toBe(true)
  })

  it('links existing entries by title and organisation, never overwriting an existing link', () => {
    const c = sampleContent()
    c.experience[0]!.title = 'Frontend Developer'
    c.experience[0]!.company = 'Acme'
    c.projects[0]!.bankId = 'other'
    const { content, linked } = linkEntries(c, [work, proj, item({ id: 'x', kind: 'project', title: c.projects[0]!.name })])
    expect(content.experience[0]!.bankId).toBe('w1')
    expect(content.projects[0]!.bankId).toBe('other')
    expect(linked).toBe(1)
  })

  it('builds a bank draft from an entry', () => {
    expect(draftFromEntry(entryFromItem(work).entry)).toMatchObject({ kind: 'work', title: 'Frontend Developer', org: 'Acme' })
    expect(draftFromEntry(entryFromItem(proj).entry)).toMatchObject({ kind: 'project', title: 'Habit tracker' })
  })
})

describe('unsupported', () => {
  it('flags new names, tools and numbers but accepts rewording', () => {
    const src = 'Built dashboards in React used by the team. Cut load time by 40%'
    expect(unsupported('Built React dashboards used by the internal team', src)).toEqual([])
    expect(unsupported('Built React and TypeScript dashboards on AWS', src)).toEqual(expect.arrayContaining(['TypeScript', 'AWS']))
    expect(unsupported('Cut load time by 55%', src)).toContain('55%')
    expect(unsupported('Cut load time by 40%.', src)).toEqual([])
  })
})

describe('buildWithAi', () => {
  const run = (reply: unknown, items = [work, proj], base = sampleContent()) => {
    const llm = mockLlm([JSON.stringify(reply)])
    return buildWithAi({ base, items, jobTitle: 'Frontend Engineer', company: 'Globex', jobDescription: 'Build React interfaces and dashboards.', perItem: 2, llm }).then((r) => ({ ...r, llm }))
  }

  it('uses reworded bullets, orders skills and sends only the chosen items', async () => {
    const { content, report, llm } = await run({
      summary: 'Frontend developer with React dashboard experience.',
      items: [
        { id: 'w1', bullets: [{ from: 0, text: 'Built React dashboards used by the internal team' }, { from: 1, text: 'Cut page load time by 40%' }] },
        { id: 'p1', bullets: [{ from: 0, text: 'Created a Firebase habit tracker' }] },
      ],
      skills: ['Firebase', 'React'],
    })
    expect(content.experience[0]!.bullets).toEqual(['Built React dashboards used by the internal team', 'Cut page load time by 40%'])
    expect(content.experience[0]!.bankId).toBe('w1')
    expect(content.projects[0]).toMatchObject({ name: 'Habit tracker', bullets: ['Created a Firebase habit tracker'], bankId: 'p1' })
    expect(content.summary).toBe('Frontend developer with React dashboard experience.')
    expect(content.skills.slice(0, 2)).toEqual(['Firebase', 'React'])
    expect(report).toMatchObject({ reworded: 3, keptOriginal: 0, summary: 'ai' })
    const sent = JSON.stringify(llm.calls[0])
    expect(sent).toContain('Habit tracker')
    expect(sent).toContain('Mentored two interns') // the item is sent whole so the AI can choose, nothing else is
  })

  it('falls back to the original text when the AI invents tools, numbers or a summary', async () => {
    const { content, report } = await run({
      summary: 'Senior engineer who led a 30-person team at Google.',
      items: [{ id: 'w1', bullets: [{ from: 0, text: 'Built React and TypeScript dashboards on AWS' }, { from: 1, text: 'Cut page load time by 70%' }] }, { id: 'p1', bullets: [{ from: 0, text: 'Built a habit tracker in Firebase' }] }],
      skills: ['Kubernetes', 'React'],
    })
    expect(content.experience[0]!.bullets).toEqual(['Built dashboards in React used by the team', 'Cut page load time by 40%'])
    expect(content.summary).toBe(sampleContent().summary)
    expect(content.skills).not.toContain('Kubernetes')
    expect(JSON.stringify([content.experience, content.projects, content.summary])).not.toMatch(/TypeScript|AWS|Google|70%/)
    expect(report).toMatchObject({ reworded: 1, keptOriginal: 2, summary: 'kept' })
    expect(report.notes.join(' ')).toMatch(/TypeScript|AWS/)
  })

  it('handles items the AI left out, unknown ids and out-of-range bullets', async () => {
    const { content, report } = await run({ items: [{ id: 'ghost', bullets: [{ from: 0, text: 'Invented job' }] }, { id: 'w1', bullets: [{ from: 9, text: 'Nothing to base this on' }] }] })
    expect(JSON.stringify(content)).not.toMatch(/Invented job|Nothing to base/)
    expect(content.experience[0]!.bullets.length).toBeGreaterThan(0)
    expect(content.projects[0]!.bullets).toEqual(['Built a habit tracker in Firebase'])
    expect(report.notes.join(' ')).toMatch(/skipped "Habit tracker"/)
  })

  it('respects the bullets-per-item limit', async () => {
    const { content } = await run({ items: [{ id: 'w1', bullets: [{ from: 0, text: 'Built React dashboards' }, { from: 1, text: 'Cut page load time by 40%' }, { from: 2, text: 'Mentored two interns' }] }] })
    expect(content.experience[0]!.bullets).toHaveLength(2)
  })
})
