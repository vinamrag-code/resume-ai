import { beforeEach, describe, expect, it } from 'vitest'
import type { Embedder } from '@/lib/ats/embeddings'
import { sampleContent } from '@/test/fixtures'
import type { BankItem } from '@/types/bank'
import { assembleContent, bankDraftsFromResume, dateValue, parseSkills } from './assemble'
import { clearEmbeddingCache, pickBullets, rankItems } from './retrieve'

const item = (over: Partial<BankItem> & Pick<BankItem, 'id' | 'kind' | 'title'>): BankItem => ({ org: '', location: '', start: '', end: '', link: '', bullets: [], skills: [], createdAt: 1, ...over })

/** Toy embedder: one dimension per topic, so "similar" is predictable without downloading a model. */
const TOPICS = [/react|frontend|ui|typescript|web/i, /python|machine|model|data|ml/i, /cook|chef|kitchen|restaurant/i]
const topicEmbedder = (calls: string[][] = []): Embedder => ({
  embed: async (texts) => {
    calls.push(texts)
    return texts.map((t) => TOPICS.map((r) => (r.test(t) ? 1 : 0.01)))
  },
})

const items = [
  item({ id: 'chef', kind: 'work', title: 'Line cook', org: 'Bistro', bullets: ['Cooked for 200 guests a night in a busy kitchen'] }),
  item({ id: 'react', kind: 'project', title: 'Dashboard', bullets: ['Built a React and TypeScript dashboard used by 40 people'], skills: ['React'] }),
  item({ id: 'ml', kind: 'project', title: 'Churn model', bullets: ['Trained a Python machine learning model on customer data'] }),
]
const JD = 'We need a frontend engineer with React and TypeScript to build web user interfaces.'

beforeEach(() => clearEmbeddingCache())

describe('rankItems', () => {
  it('puts the most relevant item first using embeddings', async () => {
    const { ranked, keywordOnly } = await rankItems(items, JD, topicEmbedder())
    expect(keywordOnly).toBe(false)
    expect(ranked.map((r) => r.item.id)[0]).toBe('react')
    const score = (id: string) => ranked.find((r) => r.item.id === id)!.score
    expect(score('react')).toBeGreaterThan(score('chef'))
    expect(score('react')).toBeGreaterThan(score('ml'))
    expect(ranked[0]!.matched.length).toBeGreaterThan(0)
  })

  it('works with keywords alone when there is no embedder or it fails', async () => {
    const none = await rankItems(items, JD)
    expect(none.keywordOnly).toBe(true)
    expect(none.ranked[0]!.item.id).toBe('react')
    const broken = await rankItems(items, JD, { embed: async () => Promise.reject(new Error('offline')) })
    expect(broken.keywordOnly).toBe(true)
    expect(broken.ranked[0]!.item.id).toBe('react')
  })

  it('does not embed the same text twice', async () => {
    const calls: string[][] = []
    const e = topicEmbedder(calls)
    await rankItems(items, JD, e)
    await rankItems(items, JD, e)
    expect(calls).toHaveLength(1)
  })

  it('handles an empty bank or job text', async () => {
    expect((await rankItems([], JD, topicEmbedder())).ranked).toEqual([])
    expect((await rankItems(items, '', topicEmbedder())).ranked).toHaveLength(3)
  })
})

describe('pickBullets', () => {
  const many = item({ id: 'm', kind: 'work', title: 'Dev', bullets: ['Cooked lunch for the team', 'Built React components in TypeScript', 'Organised the office party', 'Shipped a web UI redesign'] })
  it('keeps the best bullets in their original order', async () => {
    expect(await pickBullets(many, JD, 2, topicEmbedder())).toEqual(['Built React components in TypeScript', 'Shipped a web UI redesign'])
  })
  it('keeps everything when there are few bullets, and works without an embedder', async () => {
    expect(await pickBullets(many, JD, 10)).toHaveLength(4)
    expect(await pickBullets(many, JD, 1)).toHaveLength(1)
  })
})

describe('assembleContent', () => {
  const work = (id: string, org: string, start: string, end: string) => item({ id, kind: 'work', title: 'Engineer', org, start, end })
  it('builds experience (newest first), projects and skills from the bank and keeps the rest of the base resume', () => {
    const base = sampleContent()
    const out = assembleContent(
      base,
      [
        { item: work('a', 'Old Co', 'Jan 2019', 'Dec 2020'), bullets: ['Did old things'] },
        { item: work('b', 'Now Co', 'Mar 2023', 'Present'), bullets: ['Does new things'] },
        { item: items[1]!, bullets: items[1]!.bullets },
      ],
      JD,
    )
    expect(out.experience.map((e) => e.company)).toEqual(['Now Co', 'Old Co'])
    expect(out.experience[0]).toMatchObject({ title: 'Engineer', start: 'Mar 2023', end: 'Present', bullets: ['Does new things'] })
    expect(out.projects.map((p) => p.name)).toEqual(['Dashboard'])
    expect(out.contact).toEqual(base.contact)
    expect(out.education).toEqual(base.education)
    expect(out.skills.map((x) => x.toLowerCase())).toContain('react')
    expect(out.skills.filter((x) => x.toLowerCase() === 'react')).toHaveLength(1)
    expect(base.experience.length).toBeGreaterThan(0) // the base resume itself is untouched
  })

  it('attaches an achievement to the entry it names, or makes it a project entry', () => {
    const w = item({ id: 'w', kind: 'work', title: 'Intern', org: 'Acme', bullets: ['Wrote tests'] })
    const named = item({ id: 'a1', kind: 'achievement', title: 'Employee of the month', org: 'acme', bullets: ['Named employee of the month'] })
    const loose = item({ id: 'a2', kind: 'achievement', title: 'Won a hackathon', bullets: ['Won first place at a 200-team hackathon'] })
    const out = assembleContent(undefined, [{ item: w, bullets: w.bullets }, { item: named, bullets: named.bullets }, { item: loose, bullets: loose.bullets }], '')
    expect(out.experience[0]!.bullets).toEqual(['Wrote tests', 'Named employee of the month'])
    expect(out.projects).toMatchObject([{ name: 'Won a hackathon', bullets: ['Won first place at a 200-team hackathon'] }])
  })

  it('never adds text that is not in the bank or the base resume', () => {
    const out = assembleContent(undefined, [{ item: items[2]!, bullets: items[2]!.bullets }], JD)
    expect(JSON.stringify(out)).not.toMatch(/react|typescript/i)
  })
})

describe('helpers', () => {
  it('orders dates, with Present newest and unknown last', () => {
    expect(dateValue('Present')).toBeGreaterThan(dateValue('2024'))
    expect(dateValue('Mar 2023')).toBeGreaterThan(dateValue('Jan 2023'))
    expect(dateValue('03/2023')).toBe(dateValue('Mar 2023'))
    expect(dateValue('')).toBe(-1)
    expect(dateValue('sometime')).toBe(-1)
  })
  it('imports resume entries into the bank without duplicating what is already there', () => {
    const drafts = bankDraftsFromResume(sampleContent(), [])
    expect(drafts.some((d) => d.kind === 'work')).toBe(true)
    expect(drafts.some((d) => d.kind === 'project')).toBe(true)
    const again = bankDraftsFromResume(sampleContent(), drafts.map((d, i) => ({ ...d, id: String(i), createdAt: 1 })))
    expect(again).toEqual([])
  })
  it('parses a typed skills list', () => {
    expect(parseSkills('React, TypeScript;\nreact,  Go ,')).toEqual(['React', 'TypeScript', 'Go'])
  })
})
