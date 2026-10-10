import { afterEach, describe, expect, it } from 'vitest'
import { findNewTerms, repairContact } from '@/lib/ats/guards'
import { buildChanges, ProposedEditsSchema } from '@/lib/changes'
import { setLlmClient } from '@/lib/llm'
import { resumeToText } from '@/lib/resume'
import { sampleContent, SAMPLE_JD } from '@/test/fixtures'
import { mockLlm } from '@/test/helpers'
import { parseResumeText } from './import/parseResume'
import { qualityFilter } from './tailor/tailorResume'
import { verifyChanges } from './tailor/verifyChanges'

afterEach(() => setLlmClient(null))
const content = sampleContent()
const text = resumeToText(content)
const edit = (bullet: number, t: string) =>
  buildChanges(content, ProposedEditsSchema.parse({ bullets: [{ section: 'experience', entry: 0, bullet, text: t }] }), text)

describe('findNewTerms', () => {
  it('flags tools and names that the resume never mentions', () => {
    expect(findNewTerms('Deployed services on AWS using Kubernetes and C++', text)).toEqual(expect.arrayContaining(['AWS', 'Kubernetes', 'C++']))
  })
  it('ignores words that are in the resume and ordinary sentence capitalisation', () => {
    expect(findNewTerms('Built React dashboards with TypeScript and Node.js for analysts', text)).toEqual([])
    expect(findNewTerms('Maintained internal APIs used by analysts', text)).toEqual([])
  })
  it('adds warnings to tailoring changes', () => {
    const c = edit(1, 'Maintained internal APIs deployed on Kubernetes')[0]!
    expect(c.warnings.join(' ')).toContain('Kubernetes')
  })
})

describe('repairContact', () => {
  const src = 'Grace Hopper\ngrace@navy.mil | +1 (212) 555-0199\nAdmiral'
  it('removes invented details and recovers missed ones', () => {
    const r = repairContact(src, { email: 'invented@fake.com', phone: '' })
    expect(r.email).toBe('grace@navy.mil')
    expect(r.phone).toContain('555-0199')
    expect(r.notes[0]).toMatch(/invented@fake\.com/)
  })
  it('keeps correct details', () => {
    expect(repairContact(src, { email: 'GRACE@navy.mil', phone: '212 555 0199' })).toMatchObject({ email: 'GRACE@navy.mil', phone: '212 555 0199', notes: [] })
  })
  it('is applied when parsing', async () => {
    mockLlm([JSON.stringify({ contact: { name: 'Grace Hopper', email: 'wrong@x.com' }, experience: [], skills: [] })])
    const c = await parseResumeText(src)
    expect(c.contact.email).toBe('grace@navy.mil')
    expect(c.contact.phone).toContain('555')
  })
})

describe('qualityFilter', () => {
  it('drops rewrites that make a bullet weaker unless they add job keywords', () => {
    const worse = edit(2, 'page load faster')
    expect(qualityFilter(worse, SAMPLE_JD, text)).toHaveLength(0)
    const better = edit(1, 'Maintained internal APIs consumed by the analytics team')
    expect(qualityFilter(better, SAMPLE_JD, text)).toHaveLength(1)
  })
  it('keeps a weaker-scoring rewrite that adds a missing job keyword', () => {
    const c = edit(2, 'speeding up the GraphQL page')
    expect(qualityFilter(c, SAMPLE_JD, text)).toHaveLength(1)
  })
})

describe('verifyChanges', () => {
  const changes = edit(1, 'Maintained internal APIs consumed by the analytics team')
  it('adds a warning for claims the fact-checker reports', async () => {
    mockLlm([JSON.stringify({ results: [{ index: 0, unsupported: ['consumed by the analytics team'] }] })])
    const out = await verifyChanges(changes, text)
    expect(out[0]!.warnings.at(-1)).toMatch(/AI fact-check.*analytics team/)
  })
  it('leaves changes unchanged when everything is supported', async () => {
    mockLlm([JSON.stringify({ results: [{ index: 0, unsupported: [] }] })])
    expect(await verifyChanges(changes, text)).toEqual(changes)
  })
  it('never blocks when the checker fails', async () => {
    mockLlm(['garbage', 'still garbage'])
    expect(await verifyChanges(changes, text)).toEqual(changes)
  })
})
