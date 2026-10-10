import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newResume } from '@/lib/resume'
import { useCoverLetters } from '@/store/coverLetters'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import type { Job } from '@/types/job'
import { clearLocalData, deleteCloudData, startSync, useSyncMeta, useSyncStatus } from './engine'
import type { Remote } from './engine'
import { applyLocal, fromRemote, knownAfter, planSync, toRemote, tombstone } from './items'
import type { LocalDoc, RemoteItem } from './items'

const resume = (name: string, createdAt: number, updatedAt = createdAt) => ({ ...newResume(name, sampleContent()), id: name, createdAt, updatedAt })
const job = (id: string, createdAt: number, updatedAt?: number): Job => ({ id, title: id, company: 'C', url: '', date: '2026-01-01', status: 'saved', notes: '', description: '', createdAt, updatedAt, order: 0 })
const doc = (p: Partial<LocalDoc> = {}): LocalDoc => ({ resumes: [], jobs: [], letters: [], ...p })
const remoteMap = (...items: RemoteItem[]) => new Map(items.map((i) => [i.id, i]))

describe('planSync', () => {
  it('uploads local-only items and downloads remote-only items', () => {
    const plan = planSync(doc({ resumes: [resume('mine', 1)] }), remoteMap(toRemote('resume', resume('theirs', 2))), {})
    expect(plan.push.map((p) => p.id)).toEqual(['mine'])
    expect(plan.upserts.map((u) => u.item.id)).toEqual(['theirs'])
  })
  it('the newer edit wins; ties keep this device', () => {
    const local = { ...resume('x', 1, 50), name: 'local' }
    const newer = toRemote('resume', { ...resume('x', 1, 90), name: 'remote' })
    expect(planSync(doc({ resumes: [local] }), remoteMap(newer), {}).upserts[0]!.item).toMatchObject({ name: 'remote' })
    const older = toRemote('resume', { ...resume('x', 1, 10), name: 'remote' })
    expect(planSync(doc({ resumes: [local] }), remoteMap(older), {}).push[0]).toMatchObject({ id: 'x', updatedAt: 50 })
    const tie = toRemote('resume', { ...resume('x', 1, 50), name: 'remote' })
    const p = planSync(doc({ resumes: [local] }), remoteMap(tie), {})
    expect(p.push).toEqual([])
    expect(p.upserts).toEqual([])
  })
  it('applies remote deletions unless the item was edited afterwards', () => {
    const r = resume('gone', 1, 10)
    expect(planSync(doc({ resumes: [r] }), remoteMap(tombstone('gone', 'resume', 20)), {}).removals).toEqual([{ kind: 'resume', id: 'gone' }])
    const edited = { ...r, updatedAt: 30 }
    const p = planSync(doc({ resumes: [edited] }), remoteMap(tombstone('gone', 'resume', 20)), {})
    expect(p.removals).toEqual([])
    expect(p.push[0]).toMatchObject({ id: 'gone', deleted: false })
  })
  it('pushes a deletion made on this device instead of re-downloading the item', () => {
    const r = resume('mine', 1, 5)
    const p = planSync(doc(), remoteMap(toRemote('resume', r)), { mine: 5 }, 999)
    expect(p.push).toEqual([tombstone('mine', 'resume', 999)])
    expect(p.upserts).toEqual([])
  })
  it('ignores malformed or mismatched remote items', () => {
    const bad: RemoteItem = { id: 'z', kind: 'resume', json: '{"nope":1}', updatedAt: 1, deleted: false }
    expect(planSync(doc(), remoteMap(bad), {}).upserts).toEqual([])
    expect(fromRemote({ ...toRemote('resume', resume('a', 1)), id: 'different' })).toBeNull()
    expect(fromRemote({ ...bad, json: 'not json' })).toBeNull()
  })
  it('applyLocal and knownAfter reflect the plan', () => {
    const local = doc({ resumes: [resume('keep', 3), resume('drop', 1)], jobs: [job('j1', 1)] })
    const plan = planSync(local, remoteMap(tombstone('drop', 'resume', 99), toRemote('resume', resume('new', 5))), {})
    const next = applyLocal(local, plan)
    expect(next.resumes.map((r) => r.id)).toEqual(['new', 'keep'])
    expect(Object.keys(knownAfter(local, plan)).sort()).toEqual(['j1', 'keep', 'new'])
  })
})

/** An in-memory stand-in for Firestore that echoes writes back to subscribers like the real one. */
function fakeRemote(initial: RemoteItem[] = []) {
  const items = new Map(initial.map((i) => [i.id, i]))
  const subs = new Set<(i: RemoteItem[]) => void>()
  const emit = () => subs.forEach((s) => s([...items.values()]))
  const remote: Remote & { items: Map<string, RemoteItem>; writes: number; emit: () => void } = {
    items,
    writes: 0,
    emit,
    subscribe(on) {
      subs.add(on)
      queueMicrotask(() => on([...items.values()]))
      return () => subs.delete(on)
    },
    async write(batch) {
      remote.writes++
      for (const i of batch) items.set(i.id, i)
      emit()
    },
    async deleteAll() {
      items.clear()
      emit()
    },
  }
  return remote
}
const settle = () => new Promise((r) => setTimeout(r, 30))

describe('sync engine', () => {
  let stop: (() => void) | null = null
  beforeEach(() => {
    clearLocalData()
    useSyncMeta.setState({ account: null, known: {} })
    useSyncStatus.setState({ state: 'off', lastSynced: null, error: null })
  })
  afterEach(() => stop?.())
  const start = (remote: Remote, account = 'ada@example.com') => (stop = startSync(remote, account, 5))

  it('uploads local data on first sync and downloads it on another device', async () => {
    const cloud = fakeRemote()
    useResumes.getState().create('Mine', sampleContent())
    start(cloud)
    await settle()
    expect([...cloud.items.values()].map((i) => i.kind)).toEqual(['resume'])
    expect(useSyncStatus.getState()).toMatchObject({ state: 'idle', error: null })
    stop!()

    clearLocalData() // "another device"
    useSyncMeta.setState({ account: null, known: {} })
    start(cloud)
    await settle()
    expect(useResumes.getState().resumes.map((r) => r.name)).toEqual(['Mine'])
  })

  it('pushes later local edits and deletions, and pulls changes made elsewhere', async () => {
    const cloud = fakeRemote()
    const r = useResumes.getState().create('Doc', sampleContent())
    start(cloud)
    await settle()
    useResumes.getState().rename(r.id, 'Renamed')
    await settle()
    expect(JSON.parse(cloud.items.get(r.id)!.json).name).toBe('Renamed')

    useResumes.getState().remove(r.id)
    await settle()
    expect(cloud.items.get(r.id)).toMatchObject({ deleted: true, json: '' })

    // Another device adds a job; it appears here without any local action.
    cloud.items.set('j9', toRemote('job', job('j9', 5, 5)))
    cloud.emit()
    await settle()
    expect(useJobs.getState().jobs.map((j) => j.id)).toEqual(['j9'])
  })

  it('does not rewrite the cloud when nothing changed', async () => {
    const cloud = fakeRemote()
    useResumes.getState().create('A', sampleContent())
    start(cloud)
    await settle()
    const writes = cloud.writes
    cloud.emit()
    await settle()
    expect(cloud.writes).toBe(writes)
  })

  it('never mixes data between two accounts on one browser', async () => {
    const adaCloud = fakeRemote()
    useResumes.getState().create('Ada private', sampleContent())
    start(adaCloud, 'ada@example.com')
    await settle()
    stop!()
    const bobCloud = fakeRemote()
    start(bobCloud, 'bob@example.com')
    await settle()
    expect(useResumes.getState().resumes).toEqual([])
    expect(bobCloud.items.size).toBe(0)
    expect(JSON.stringify([...bobCloud.items.values()])).not.toContain('Ada private')
  })

  it('syncs jobs and letters as well', async () => {
    const cloud = fakeRemote()
    useJobs.getState().add({ title: 'Dev', company: 'Hooli' })
    useCoverLetters.getState().add({ title: 'L', resumeId: 'r', tone: 'formal', jobTitle: '', company: '', jobDescription: '', body: 'hi' })
    start(cloud)
    await settle()
    expect([...cloud.items.values()].map((i) => i.kind).sort()).toEqual(['job', 'letter'])
  })

  it('reports cloud errors and keeps local data', async () => {
    const remote: Remote = { subscribe: (_ok, onError) => (queueMicrotask(() => onError(new Error('Cloud sync is not allowed.'))), () => undefined), write: async () => undefined, deleteAll: async () => undefined }
    useResumes.getState().create('Safe', sampleContent())
    start(remote)
    await settle()
    expect(useSyncStatus.getState()).toMatchObject({ state: 'error', error: 'Cloud sync is not allowed.' })
    expect(useResumes.getState().resumes).toHaveLength(1)
  })

  it('deleting cloud data stops syncing so nothing is uploaded again', async () => {
    const cloud = fakeRemote()
    useResumes.getState().create('A', sampleContent())
    start(cloud)
    await settle()
    expect(cloud.items.size).toBe(1)
    expect(await deleteCloudData()).toBe(true)
    await settle()
    expect(cloud.items.size).toBe(0)
    expect(useResumes.getState().resumes).toHaveLength(1) // local copy is kept
    expect(useSyncStatus.getState().state).toBe('off')
  })
})
