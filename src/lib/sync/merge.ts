import type { SyncDoc } from './schema'

type Item = { id: string; createdAt: number; updatedAt?: number }
const stamp = (i: Item) => i.updatedAt ?? i.createdAt

/** Keep both sides' items; the newer edit wins; deleted items stay deleted unless edited after the deletion. */
function mergeList<T extends Item>(local: T[], remote: T[], tomb: Record<string, number>): T[] {
  const byId = new Map<string, T>()
  for (const item of [...remote, ...local]) {
    const cur = byId.get(item.id)
    // On equal timestamps prefer the local copy (the device being used right now).
    if (!cur || stamp(item) >= stamp(cur)) byId.set(item.id, item)
  }
  return [...byId.values()].filter((i) => !(i.id in tomb) || stamp(i) > (tomb[i.id] ?? 0))
}

const THIRTY_DAYS = 30 * 86_400_000

/** Pure three-way-free merge of two sync documents. Order is stable: newest created first. */
export function mergeDocs(local: SyncDoc, remote: SyncDoc, now = Date.now()): SyncDoc {
  const tombstones: Record<string, number> = { ...remote.tombstones }
  for (const [id, t] of Object.entries(local.tombstones)) tombstones[id] = Math.max(t, tombstones[id] ?? 0)
  const sortNew = <T extends Item>(xs: T[]) => [...xs].sort((a, b) => b.createdAt - a.createdAt)
  const resumes = sortNew(mergeList(local.resumes, remote.resumes, tombstones))
  const jobs = mergeList(local.jobs, remote.jobs, tombstones)
  const letters = sortNew(mergeList(local.letters, remote.letters, tombstones))
  const kept = Object.fromEntries(Object.entries(tombstones).filter(([, t]) => now - t < THIRTY_DAYS))
  return { resumes, jobs, letters, tombstones: kept }
}

export const idsOf = (d: Pick<SyncDoc, 'resumes' | 'jobs' | 'letters'>): string[] => [...d.resumes, ...d.jobs, ...d.letters].map((i) => i.id)

/** Record items that existed at the last sync but are gone now as deletions. */
export function withDeletions(doc: SyncDoc, lastIds: string[], now = Date.now()): SyncDoc {
  const present = new Set(idsOf(doc))
  const tombstones = { ...doc.tombstones }
  for (const id of lastIds) if (!present.has(id) && !(id in tombstones)) tombstones[id] = now
  return { ...doc, tombstones }
}

export const sameDoc = (a: SyncDoc, b: SyncDoc): boolean => JSON.stringify(a) === JSON.stringify(b)
