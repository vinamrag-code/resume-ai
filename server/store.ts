import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SyncDoc } from '../src/lib/sync/schema'
import type { ServerConfig } from './config'

export interface Stored {
  rev: number
  data: SyncDoc
}

export type PutResult = { ok: true; rev: number } | { ok: false; current: Stored | null }

/** One document per user, with optimistic concurrency: a write only succeeds if `baseRev` is still current. */
export interface SyncStore {
  get(userId: string): Promise<Stored | null>
  put(userId: string, data: SyncDoc, baseRev: number): Promise<PutResult>
  delete(userId: string): Promise<void>
  close?(): Promise<void>
}

/** JSON file per user. Fine for a single server with a persistent disk (and for local development). */
export class FileStore implements SyncStore {
  private locks = new Map<string, Promise<unknown>>()
  constructor(private readonly dir: string) {}

  private path(userId: string) {
    return join(this.dir, `${createHash('sha256').update(userId).digest('hex')}.json`)
  }

  /** Serialise operations per user so read-modify-write cannot interleave. */
  private async locked<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(userId) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    this.locks.set(userId, next.catch(() => undefined))
    return next
  }

  async get(userId: string): Promise<Stored | null> {
    try {
      return JSON.parse(await readFile(this.path(userId), 'utf8')) as Stored
    } catch {
      return null
    }
  }

  put(userId: string, data: SyncDoc, baseRev: number): Promise<PutResult> {
    return this.locked(userId, async () => {
      const current = await this.get(userId)
      if ((current?.rev ?? 0) !== baseRev) return { ok: false, current }
      const rev = baseRev + 1
      await mkdir(this.dir, { recursive: true })
      const file = this.path(userId)
      const tmp = `${file}.${process.pid}.tmp`
      await writeFile(tmp, JSON.stringify({ rev, data } satisfies Stored), { mode: 0o600 })
      await rename(tmp, file)
      return { ok: true, rev }
    })
  }

  async delete(userId: string): Promise<void> {
    await rm(this.path(userId), { force: true })
  }
}

/** Minimal slice of `pg`'s Pool that we use, so tests can run against a real or fake database. */
export interface PgPool {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>
  end(): Promise<void>
}

/** PostgreSQL: durable across restarts and deploys, safe with several server instances. */
export class PgStore implements SyncStore {
  private ready: Promise<unknown>
  constructor(private readonly pool: PgPool) {
    this.ready = pool.query('CREATE TABLE IF NOT EXISTS user_data (user_id text PRIMARY KEY, rev integer NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())')
  }

  async get(userId: string): Promise<Stored | null> {
    await this.ready
    const r = await this.pool.query('SELECT rev, data FROM user_data WHERE user_id = $1', [userId])
    const row = r.rows[0]
    return row ? { rev: Number(row.rev), data: row.data as SyncDoc } : null
  }

  async put(userId: string, data: SyncDoc, baseRev: number): Promise<PutResult> {
    await this.ready
    const json = JSON.stringify(data)
    const r =
      baseRev === 0
        ? await this.pool.query('INSERT INTO user_data (user_id, rev, data) VALUES ($1, 1, $2::jsonb) ON CONFLICT (user_id) DO NOTHING', [userId, json])
        : await this.pool.query('UPDATE user_data SET rev = rev + 1, data = $3::jsonb, updated_at = now() WHERE user_id = $1 AND rev = $2', [userId, baseRev, json])
    if (r.rowCount === 1) return { ok: true, rev: baseRev + 1 }
    return { ok: false, current: await this.get(userId) }
  }

  async delete(userId: string): Promise<void> {
    await this.ready
    await this.pool.query('DELETE FROM user_data WHERE user_id = $1', [userId])
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}

export async function createStore(cfg: Pick<ServerConfig, 'databaseUrl' | 'dataDir'>): Promise<SyncStore> {
  if (cfg.databaseUrl) {
    const { default: pg } = await import('pg')
    const ssl = /localhost|127\.0\.0\.1/.test(cfg.databaseUrl) ? undefined : { rejectUnauthorized: false }
    return new PgStore(new pg.Pool({ connectionString: cfg.databaseUrl, ssl, max: 5 }) as unknown as PgPool)
  }
  return new FileStore(join(cfg.dataDir, 'users'))
}
