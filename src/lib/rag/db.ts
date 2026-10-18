import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'

export type SourceKind = 'resume' | 'file' | 'job'
export const asKind = (k: unknown): SourceKind => (k === 'file' || k === 'job' ? k : 'resume')

/**
 * One searchable passage. Its id is a hash of its text, so identical text from different places (the same job
 * saved in the tracker and on three resumes) is stored and embedded once and lists every source it came from.
 */
export interface ChunkRecord {
  id: string
  /** Where it comes from, e.g. `Resume: Main · Experience · Acme`. Part of the embedded text. */
  header: string
  body: string
  kind: SourceKind
  vector: number[]
  /** Ids of every source that contains this passage. */
  sources: string[]
}

/** What was indexed for a source, so unchanged sources are skipped. */
export interface SourceRecord {
  id: string
  kind: SourceKind
  title: string
  /** Hash of the chunk ids: changes exactly when the content does. */
  hash: string
  /** The embedding model the vectors came from; a different model means re-embedding. */
  model: string
  chunkIds: string[]
  updatedAt: number
}

/** A chunk to store; `vector` may be left out for one already in the database. */
export type NewChunk = Omit<ChunkRecord, 'vector' | 'sources'> & { vector?: number[] }

interface RagDb extends DBSchema {
  chunks: { key: string; value: ChunkRecord }
  sources: { key: string; value: SourceRecord }
}

const NAME = 'resume-ai-rag'
let dbPromise: Promise<IDBPDatabase<RagDb>> | null = null

/** The browser's IndexedDB holds the vector store: nothing leaves this device except the prompt text. */
export function getDb(): Promise<IDBPDatabase<RagDb>> {
  dbPromise ??= openDB<RagDb>(NAME, 2, {
    upgrade(db) {
      // v1 keyed chunks by source and stored duplicates; the index is cheap to rebuild, so start clean.
      for (const name of [...db.objectStoreNames]) db.deleteObjectStore(name as 'chunks' | 'sources')
      db.createObjectStore('chunks', { keyPath: 'id' })
      db.createObjectStore('sources', { keyPath: 'id' })
    },
  }).catch((err: unknown) => {
    dbPromise = null
    throw err
  })
  return dbPromise
}

/** Which of these chunk ids are already stored (so only new text needs embedding). */
export async function existingChunkIds(ids: string[]): Promise<Set<string>> {
  const db = await getDb()
  const found = await Promise.all(ids.map((id) => db.getKey('chunks', id)))
  return new Set(found.filter((k): k is string => k !== undefined))
}

/** Remove a source from a chunk, deleting the chunk once nothing refers to it. */
async function release(tx: { objectStore(n: 'chunks'): { get(k: string): Promise<ChunkRecord | undefined>; put(v: ChunkRecord): Promise<unknown>; delete(k: string): Promise<unknown> } }, chunkId: string, sourceId: string) {
  const store = tx.objectStore('chunks')
  const c = await store.get(chunkId)
  if (!c) return
  const sources = c.sources.filter((s) => s !== sourceId)
  if (sources.length) await store.put({ ...c, sources })
  else await store.delete(chunkId)
}

/** Replace everything stored for a source in one transaction; chunks shared with other sources are kept. */
export async function replaceSource(source: SourceRecord, chunks: NewChunk[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['chunks', 'sources'], 'readwrite')
  const old = (await tx.objectStore('sources').get(source.id))?.chunkIds ?? []
  const next = new Set(chunks.map((c) => c.id))
  for (const id of old) if (!next.has(id)) await release(tx, id, source.id)
  for (const c of chunks) {
    const have = await tx.objectStore('chunks').get(c.id)
    if (have) {
      if (!have.sources.includes(source.id)) await tx.objectStore('chunks').put({ ...have, sources: [...have.sources, source.id] })
    } else if (c.vector) {
      await tx.objectStore('chunks').put({ id: c.id, header: c.header, body: c.body, kind: c.kind, vector: c.vector, sources: [source.id] })
    }
  }
  await tx.objectStore('sources').put({ ...source, chunkIds: [...next] })
  await tx.done
}

export async function removeSource(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['chunks', 'sources'], 'readwrite')
  const known = await tx.objectStore('sources').get(id)
  for (const chunkId of known?.chunkIds ?? []) await release(tx, chunkId, id)
  await tx.objectStore('sources').delete(id)
  await tx.done
}

export async function listSources(): Promise<SourceRecord[]> {
  return (await getDb()).getAll('sources')
}

export async function allChunks(): Promise<ChunkRecord[]> {
  return (await getDb()).getAll('chunks')
}

export async function clearAll(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['chunks', 'sources'], 'readwrite')
  await Promise.all([tx.objectStore('chunks').clear(), tx.objectStore('sources').clear()])
  await tx.done
}
