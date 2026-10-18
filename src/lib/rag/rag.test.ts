import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { Embeddings } from '@langchain/core/embeddings'
import { allChunks, clearAll, listSources } from './db'
import type { ChunkRecord, SourceRecord } from './db'
import { forgetImportedFile, indexImportedFile, syncJobs, syncResumes } from './indexer'
import { loadImportedFile, loadResume, splitSource } from './loaders'
import { rankChunks } from './rank'
import { retrieveContext, setEmbeddings } from './retrieve'
import { newResume } from '@/lib/resume'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import type { Resume } from '@/types/resume'

/** Deterministic bag-of-words embedder: shared words = similar vectors. */
const VOCAB = ['kubernetes', 'react', 'python', 'sales', 'budget', 'typescript', 'leadership', 'design']
const vec = (t: string): number[] => VOCAB.map((w): number => (t.toLowerCase().includes(w) ? 1 : 0)).concat([0.01])
class FakeEmbeddings extends Embeddings {
  embedded: string[] = []
  constructor() {
    super({})
  }
  async embedDocuments(texts: string[]) {
    this.embedded.push(...texts)
    return texts.map(vec)
  }
  async embedQuery(t: string) {
    return vec(t)
  }
}

const JD = 'We need a senior engineer with deep kubernetes and python experience for our platform team.'
const withTarget = (r: Resume, description: string): Resume => ({ ...r, target: { title: 'SRE', company: 'Acme', description, location: '', workType: 'unspecified' } })

beforeEach(async () => {
  await clearAll()
  setEmbeddings(null)
  useResumes.setState({ resumes: [] })
  useJobs.setState({ jobs: [] })
})

describe('loading and splitting', () => {
  it('cuts a resume by entry, with a header on each passage and no contact details', async () => {
    const r = newResume('Main', sampleContent())
    const passages = await splitSource(loadResume(r))
    expect(passages.length).toBeGreaterThan(2)
    expect(passages.every((p) => p.header.startsWith('[Resume: Main · '))).toBe(true)
    expect(passages.some((p) => p.header.includes('Experience'))).toBe(true)
    expect(passages.map((p) => p.body).join('\n')).not.toContain(r.content.contact.email)
  })
  it('splits long text under the size limit, repeating the header, and drops repeated passages', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `Line ${i} about kubernetes clusters and deployments.`).join('\n')
    const parts = await splitSource(loadImportedFile('cv.pdf', long))
    expect(parts.length).toBeGreaterThan(2)
    expect(parts.every((p) => p.body.length <= 700 && p.header === '[File: cv.pdf]')).toBe(true)
    const twice = await splitSource({ ...loadImportedFile('x.txt', 'same text here'), docs: [...loadImportedFile('x.txt', 'same text here').docs, ...loadImportedFile('x.txt', 'same text here').docs] })
    expect(twice).toHaveLength(1)
  })
})

describe('de-duplicated index', () => {
  it('stores and embeds a job description once, however many places hold it', async () => {
    const e = new FakeEmbeddings()
    const job = useJobs.getState().add({ title: 'SRE', company: 'Acme', description: JD })
    const base = newResume('Main', sampleContent())
    const resumes = [withTarget(base, JD), withTarget({ ...newResume('Tailored', sampleContent()), baseResumeId: base.id }, JD)]
    await syncJobs(useJobs.getState().jobs, resumes, e)
    const jobChunks = (await allChunks()).filter((c) => c.kind === 'job')
    expect(jobChunks).toHaveLength(1)
    expect(jobChunks[0]!.sources.sort()).toEqual([`job:${job.id}`, `target:${resumes[0]!.id}`, `target:${resumes[1]!.id}`].sort())
    expect(e.embedded).toHaveLength(1)
  })
  it('leaves tailored copies out while their base resume exists, and includes them when it is gone', async () => {
    const e = new FakeEmbeddings()
    const base = newResume('Main', sampleContent())
    const copy = { ...newResume('Tailored', sampleContent()), baseResumeId: base.id }
    await syncResumes([base, copy], e)
    expect((await listSources()).map((s) => s.id)).toEqual([`resume:${base.id}`])
    await syncResumes([copy], e)
    expect((await listSources()).map((s) => s.id)).toEqual([`resume:${copy.id}`])
  })
  it('skips unchanged sources and embeds only the passages that changed', async () => {
    const e = new FakeEmbeddings()
    const r = newResume('Main', sampleContent())
    await syncResumes([r], e)
    const first = e.embedded.length
    await syncResumes([r], e)
    expect(e.embedded).toHaveLength(first)
    const edited = { ...r, content: { ...r.content, summary: 'Brand new summary about kubernetes leadership.' } }
    await syncResumes([edited], e)
    expect(e.embedded).toHaveLength(first + 1)
  })
  it('keeps a shared passage until its last source is removed', async () => {
    const e = new FakeEmbeddings()
    const a = withTarget(newResume('A', sampleContent()), JD)
    const b = withTarget(newResume('B', sampleContent()), JD)
    await syncJobs([], [a, b], e)
    await syncJobs([], [b], e)
    expect((await allChunks()).filter((c) => c.kind === 'job')).toHaveLength(1)
    await syncJobs([], [], e)
    expect(await allChunks()).toEqual([])
  })
  it('forgets an imported file', async () => {
    const e = new FakeEmbeddings()
    await indexImportedFile('cv.txt', 'Led a kubernetes migration for a payments team.', e)
    expect((await allChunks()).length).toBe(1)
    await forgetImportedFile('cv.txt')
    expect(await allChunks()).toEqual([])
  })
  it('rebuilds the index when it was made with another embedding model', async () => {
    const e = new FakeEmbeddings()
    await indexImportedFile('a.txt', 'Led a kubernetes migration for a payments team.', e)
    const db = await (await import('./db')).getDb()
    const [s] = await listSources()
    await db.put('sources', { ...s!, model: 'old-model' })
    await indexImportedFile('b.txt', 'Built react and typescript dashboards for sales.', e)
    expect((await listSources()).map((x) => x.id)).toEqual(['file:b.txt'])
  })
})

describe('rankChunks', () => {
  const chunk = (id: string, header: string, body: string, sources = [id]): ChunkRecord => ({ id, header, body, kind: 'resume', vector: vec(`${header}\n${body}`), sources })
  const src = (id: string, chunkIds: string[]): SourceRecord => ({ id, kind: 'resume', title: id, hash: '', model: '', chunkIds, updatedAt: 0 })
  const q = 'help me describe my kubernetes and python experience'

  it('prefers relevant passages and ignores unrelated ones', () => {
    const chunks = [chunk('a', '[Resume: A]', 'Led kubernetes platform work in python for the infra team'), chunk('b', '[Resume: B]', 'Managed sales budget and leadership')]
    expect(rankChunks(chunks, [], vec(q), q, { k: 4 }).map((c) => c.id)).toEqual(['a'])
  })
  it('drops passages the prompt already contains, and the rest of a source that is mostly in it', () => {
    const inPrompt = chunk('a1', '[Resume: A]', '- Led kubernetes platform migration across regions', ['resume:a'])
    const sameResume = chunk('a2', '[Resume: A]', '- Automated python tooling for kubernetes deploys', ['resume:a'])
    const other = chunk('o', '[File: old]', 'Built kubernetes operators in python for the data team', ['file:old'])
    const prompt = '{"bullets":[{"text":"Led kubernetes platform migration across regions"}]}'
    const sources = [src('resume:a', ['a1', 'a2']), src('file:old', ['o'])]
    // Half of resume A is in the prompt, so its other passage is not repeated either; the unrelated source stays.
    expect(rankChunks([inPrompt, sameResume, other], sources, vec(q), q, { k: 4, promptText: prompt }).map((c) => c.id)).toEqual(['o'])
    // Without that prompt both of resume A's passages are fair game.
    expect(rankChunks([inPrompt, sameResume], sources, vec(q), q, { k: 4 }).map((c) => c.id).sort()).toEqual(['a1', 'a2'])
  })
  it('removes near-duplicates and spreads picks over different material', () => {
    const dup1 = chunk('d1', '[Job: SRE at Acme]', 'kubernetes python platform role')
    const dup2 = chunk('d2', '[Job: SRE at Beta]', 'kubernetes python platform role')
    const different = chunk('x', '[Resume: A]', 'Built react and typescript tooling plus kubernetes dashboards')
    const out = rankChunks([dup1, dup2, different], [], vec(q), q, { k: 3, lambda: 0.5 })
    expect(out.map((c) => c.id)).not.toEqual(expect.arrayContaining(['d1', 'd2']))
    expect(out.map((c) => c.id)).toContain('x')
  })
  it('keeps a passage that only matches by keyword', () => {
    const exact = chunk('k', '[Resume: A]', 'Certified for SOC2 audits')
    expect(rankChunks([exact], [], vec('soc2 audit experience needed'), 'soc2 audit experience needed', { k: 2 }).map((c) => c.id)).toEqual(['k'])
  })
})

describe('retrieveContext', () => {
  it('returns relevant passages with their headers, and never throws', async () => {
    setEmbeddings(new FakeEmbeddings())
    await indexImportedFile('old-cv.txt', 'Shipped kubernetes tooling and python automation.', new FakeEmbeddings())
    const ctx = await retrieveContext('help me describe my kubernetes experience')
    expect(ctx).toContain('[File: old-cv.txt]')
    expect(ctx).toContain('kubernetes tooling')
    setEmbeddings({ embedDocuments: async () => { throw new Error('model offline') }, embedQuery: async () => { throw new Error('model offline') } })
    expect(await retrieveContext('help me describe my kubernetes experience')).toBe('')
  })
  it('skips short messages that the conversation can answer', async () => {
    const e = new FakeEmbeddings()
    setEmbeddings(e)
    await indexImportedFile('cv.txt', 'Shipped kubernetes tooling and python automation.', e)
    expect(await retrieveContext('make it shorter')).toBe('')
    expect(await retrieveContext('   ')).toBe('')
  })
  it('includes job descriptions once even when saved in two places', async () => {
    setEmbeddings(new FakeEmbeddings())
    useJobs.getState().add({ title: 'SRE', company: 'Acme', description: JD })
    useResumes.setState({ resumes: [withTarget(newResume('Main', sampleContent()), JD)] })
    const ctx = await retrieveContext('what does the kubernetes role need from me?')
    expect(ctx).toContain('[Job: SRE at Acme]')
    expect(ctx.split('deep kubernetes').length - 1).toBe(1)
  })
})
