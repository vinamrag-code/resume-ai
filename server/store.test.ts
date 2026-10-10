// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { emptyDoc } from '../src/lib/sync/schema'
import { newResume } from '../src/lib/resume'
import { FileStore, PgStore } from './store'
import type { PgPool, SyncStore } from './store'

const doc = (name: string) => ({ ...emptyDoc(), resumes: [newResume(name)] })

function contract(make: () => Promise<SyncStore>) {
  it('stores, versions and isolates users', async () => {
    const s = await make()
    expect(await s.get('u1')).toBeNull()
    expect(await s.put('u1', doc('A'), 0)).toEqual({ ok: true, rev: 1 })
    expect((await s.get('u1'))?.rev).toBe(1)
    expect(await s.put('u1', doc('B'), 1)).toEqual({ ok: true, rev: 2 })
    expect(await s.get('u2')).toBeNull()
    expect((await s.get('u1'))?.data.resumes[0]?.name).toBe('B')
  })
  it('rejects writes based on an old revision and returns the current copy', async () => {
    const s = await make()
    await s.put('c', doc('first'), 0)
    const r = await s.put('c', doc('lost'), 0)
    expect(r).toMatchObject({ ok: false, current: { rev: 1 } })
    expect((r.ok === false && r.current?.data.resumes[0]?.name) || '').toBe('first')
    expect((await s.put('c', doc('late'), 5)).ok).toBe(false)
  })
  it('lets exactly one of many concurrent writers win', async () => {
    const s = await make()
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => s.put('race', doc(`w${i}`), 0)))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect((await s.get('race'))?.rev).toBe(1)
  })
  it('deletes', async () => {
    const s = await make()
    await s.put('d', doc('x'), 0)
    await s.delete('d')
    expect(await s.get('d')).toBeNull()
    expect((await s.put('d', doc('again'), 0)).ok).toBe(true)
  })
}

describe('FileStore', () => {
  const dirs: string[] = []
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
  })
  contract(async () => {
    const d = await mkdtemp(join(tmpdir(), 'ra-store-'))
    dirs.push(d)
    return new FileStore(d)
  })
})

// Runs against a real PostgreSQL when PG_TEST_URL is set (e.g. a throwaway Docker container).
describe.skipIf(!process.env.PG_TEST_URL)('PgStore (real PostgreSQL)', () => {
  const pools: PgPool[] = []
  afterAll(async () => {
    await Promise.all(pools.map((p) => p.end()))
  })
  contract(async () => {
    const { default: pg } = await import('pg')
    const pool = new pg.Pool({ connectionString: process.env.PG_TEST_URL }) as unknown as PgPool
    pools.push(pool)
    await pool.query('DROP TABLE IF EXISTS user_data')
    return new PgStore(pool)
  })
})
