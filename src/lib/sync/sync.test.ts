import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/lib/auth/store'
import { newResume } from '@/lib/resume'
import { useCoverLetters } from '@/store/coverLetters'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import { clearLocalData, deleteCloudData, syncNow, useSyncMeta, useSyncStatus } from './engine'
import { idsOf, mergeDocs, withDeletions } from './merge'
import { emptyDoc, SyncDocSchema } from './schema'
import type { SyncDoc } from './schema'
import type { Job } from '@/types/job'

const resume = (name: string, createdAt: number, updatedAt = createdAt) => ({ ...newResume(name, sampleContent()), id: name, createdAt, updatedAt })
const job = (id: string, createdAt: number, updatedAt?: number): Job => ({ id, title: id, company: 'C', url: '', date: '2026-01-01', status: 'saved', notes: '', description: '', createdAt, updatedAt, order: 0 })
const doc = (p: Partial<SyncDoc> = {}): SyncDoc => ({ ...emptyDoc(), ...p })

describe('mergeDocs', () => {
  it('unions both sides, newest created first', () => {
    const m = mergeDocs(doc({ resumes: [resume('a', 1)] }), doc({ resumes: [resume('b', 2)] }))
    expect(m.resumes.map((r) => r.id)).toEqual(['b', 'a'])
  })
  it('keeps the more recently edited copy of the same item', () => {
    const local = resume('x', 1, 50)
    const remote = { ...resume('x', 1, 90), name: 'remote edit' }
    expect(mergeDocs(doc({ resumes: [local] }), doc({ resumes: [remote] })).resumes[0]!.name).toBe('remote edit')
    expect(mergeDocs(doc({ resumes: [{ ...local, name: 'local edit', updatedAt: 99 }] }), doc({ resumes: [remote] })).resumes[0]!.name).toBe('local edit')
  })
  it('prefers the local copy on a tie, and uses updatedAt for jobs', () => {
    const a = { ...job('j', 1, 5), notes: 'local' }
    const b = { ...job('j', 1, 5), notes: 'remote' }
    expect(mergeDocs(doc({ jobs: [a] }), doc({ jobs: [b] })).jobs[0]!.notes).toBe('local')
    expect(mergeDocs(doc({ jobs: [a] }), doc({ jobs: [{ ...b, updatedAt: 6 }] })).jobs[0]!.notes).toBe('remote')
  })
  it('keeps deletions deleted unless the item was edited afterwards', () => {
    const r = resume('gone', 1, 10)
    expect(mergeDocs(doc({ resumes: [r] }), doc({ tombstones: { gone: 20 } }), 30).resumes).toEqual([])
    expect(mergeDocs(doc({ tombstones: { gone: 20 } }), doc({ resumes: [r] }), 30).resumes).toEqual([])
    expect(mergeDocs(doc({ resumes: [{ ...r, updatedAt: 25 }] }), doc({ tombstones: { gone: 20 } }), 30).resumes).toHaveLength(1)
  })
  it('merges tombstones and drops old ones', () => {
    const day = 86_400_000
    const m = mergeDocs(doc({ tombstones: { a: 100, old: 1 } }), doc({ tombstones: { a: 500, b: 200 } }), 100 * day)
    expect(m.tombstones).toEqual({}) // everything here is older than 30 days
    const fresh = mergeDocs(doc({ tombstones: { a: 100 * day - 1 } }), doc({ tombstones: { b: 100 * day - 2 } }), 100 * day)
    expect(Object.keys(fresh.tombstones).sort()).toEqual(['a', 'b'])
  })
  it('is idempotent and symmetric in content', () => {
    const a = doc({ resumes: [resume('a', 1)], jobs: [job('j1', 1)] })
    const b = doc({ resumes: [resume('b', 2)], jobs: [job('j2', 2)] })
    const ab = mergeDocs(a, b)
    expect(mergeDocs(ab, b)).toEqual(ab)
    expect(idsOf(mergeDocs(b, a)).sort()).toEqual(idsOf(ab).sort())
  })
  it('records deletions made since the last sync', () => {
    const d = withDeletions(doc({ resumes: [resume('keep', 1)] }), ['keep', 'removed'], 77)
    expect(d.tombstones).toEqual({ removed: 77 })
  })
})

/** A fake /api/sync with the real server's revision rules. */
function fakeServer() {
  let rev = 0
  let data: unknown = null
  const calls: string[] = []
  const handler = async (url: string, init?: RequestInit) => {
    expect(url).toBe('/api/sync')
    const method = init?.method ?? 'GET'
    calls.push(method)
    if (method === 'GET') return new Response(JSON.stringify({ rev, data }))
    if (method === 'DELETE') {
      rev = 0
      data = null
      return new Response('{"ok":true}')
    }
    const body = JSON.parse(init!.body as string) as { baseRev: number; data: unknown }
    expect(SyncDocSchema.safeParse(body.data).success).toBe(true)
    if (body.baseRev !== rev) return new Response(JSON.stringify({ rev, data }), { status: 409 })
    rev++
    data = body.data
    return new Response(JSON.stringify({ rev }))
  }
  return { handler, calls, get rev() { return rev }, get data() { return data as SyncDoc | null }, set data(v: SyncDoc | null) { data = v }, bump() { rev++ } }
}

describe('sync engine', () => {
  const signIn = (email = 'ada@example.com') => useAuth.setState({ user: { email, name: 'Ada', picture: '' }, required: true, loaded: true })
  beforeEach(() => {
    clearLocalData()
    useSyncMeta.setState({ account: null, rev: 0, lastIds: [], tombstones: {} })
    useSyncStatus.setState({ state: 'off', lastSynced: null, error: null })
    signIn()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuth.setState({ user: null, required: false })
  })

  it('uploads local data on first sync and downloads it on another device', async () => {
    const srv = fakeServer()
    vi.stubGlobal('fetch', vi.fn(srv.handler))
    useResumes.getState().create('Mine', sampleContent())
    await syncNow()
    expect(srv.data!.resumes.map((r) => r.name)).toEqual(['Mine'])
    expect(useSyncStatus.getState()).toMatchObject({ state: 'idle', error: null })

    // "Another device": empty local state, same account.
    clearLocalData()
    useSyncMeta.setState({ account: null, rev: 0, lastIds: [], tombstones: {} })
    await syncNow()
    expect(useResumes.getState().resumes.map((r) => r.name)).toEqual(['Mine'])
  })

  it('resolves a write conflict by merging and retrying', async () => {
    const srv = fakeServer()
    srv.data = doc({ resumes: [resume('cloud-only', 5)] })
    srv.bump()
    const fetchMock = vi.fn(srv.handler)
    // The first PUT loses a race: someone else writes just before it lands.
    let raced = false
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => {
      if (i?.method === 'PUT' && !raced) {
        raced = true
        srv.data = doc({ resumes: [resume('cloud-only', 5), resume('other-device', 6)] })
        srv.bump()
      }
      return fetchMock(u, i)
    }))
    useResumes.getState().create('local', sampleContent())
    await syncNow()
    expect(srv.data!.resumes.map((r) => r.name).sort()).toEqual(['cloud-only', 'local', 'other-device'])
    expect(useResumes.getState().resumes).toHaveLength(3)
    expect(useSyncStatus.getState().state).toBe('idle')
  })

  it('propagates deletions instead of resurrecting items', async () => {
    const srv = fakeServer()
    vi.stubGlobal('fetch', vi.fn(srv.handler))
    const r = useResumes.getState().create('Temp', sampleContent())
    await syncNow()
    useResumes.getState().remove(r.id)
    await syncNow()
    expect(srv.data!.resumes).toEqual([])
    expect(srv.data!.tombstones[r.id]).toBeGreaterThan(0)
    // A stale device that still has the item does not bring it back.
    useResumes.setState({ resumes: [{ ...r }] })
    useSyncMeta.setState({ lastIds: [] })
    await syncNow()
    expect(useResumes.getState().resumes).toEqual([])
  })

  it('does not write when nothing changed', async () => {
    const srv = fakeServer()
    vi.stubGlobal('fetch', vi.fn(srv.handler))
    useResumes.getState().create('A', sampleContent())
    await syncNow()
    srv.calls.length = 0
    await syncNow()
    expect(srv.calls).toEqual(['GET'])
  })

  it('never mixes data between two accounts on one browser', async () => {
    const srv = fakeServer()
    vi.stubGlobal('fetch', vi.fn(srv.handler))
    useResumes.getState().create('Ada private', sampleContent())
    await syncNow()
    expect(useSyncMeta.getState().account).toBe('ada@example.com')

    useAuth.setState({ user: { email: 'bob@example.com', name: 'Bob', picture: '' } })
    const bobServer = fakeServer()
    vi.stubGlobal('fetch', vi.fn(bobServer.handler))
    await syncNow()
    expect(useResumes.getState().resumes).toEqual([])
    expect(bobServer.data?.resumes ?? []).toEqual([])
    expect(JSON.stringify(bobServer.data)).not.toContain('Ada private')
  })

  it('reports errors without throwing, and does nothing when signed out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await syncNow()
    expect(useSyncStatus.getState()).toMatchObject({ state: 'error' })
    expect(useSyncStatus.getState().error).toMatch(/Sign in again/)
    useAuth.setState({ user: null })
    await syncNow()
    expect(useSyncStatus.getState().state).toBe('off')
  })

  it('deleteCloudData calls the server and resets the revision', async () => {
    const srv = fakeServer()
    vi.stubGlobal('fetch', vi.fn(srv.handler))
    useResumes.getState().create('A', sampleContent())
    await syncNow()
    expect(await deleteCloudData()).toBe(true)
    expect(srv.data).toBeNull()
    expect(useSyncMeta.getState().rev).toBe(0)
  })

  it('keeps jobs and letters in sync too', async () => {
    const srv = fakeServer()
    vi.stubGlobal('fetch', vi.fn(srv.handler))
    useJobs.getState().add({ title: 'Dev', company: 'Hooli' })
    useCoverLetters.getState().add({ title: 'L', resumeId: 'r', tone: 'formal', jobTitle: '', company: '', jobDescription: '', body: 'hi' })
    await syncNow()
    expect(srv.data!.jobs).toHaveLength(1)
    expect(srv.data!.letters).toHaveLength(1)
  })
})
