import { CoverLetterSchema, JobSchema } from '@/types/job'
import type { CoverLetter, Job } from '@/types/job'
import { ResumeSchema } from '@/types/resume'
import type { Resume } from '@/types/resume'

export type Kind = 'resume' | 'job' | 'letter'
export type LocalItem = Resume | Job | CoverLetter

/** What is stored in Firestore for one item (users/{uid}/items/{id}). */
export interface RemoteItem {
  id: string
  kind: Kind
  /** The item as JSON text (empty when deleted). */
  json: string
  /** Last edit (or deletion) time in ms; the newer side wins. */
  updatedAt: number
  deleted: boolean
}

export interface LocalDoc {
  resumes: Resume[]
  jobs: Job[]
  letters: CoverLetter[]
}

export const stampOf = (i: { createdAt: number; updatedAt?: number }): number => i.updatedAt ?? i.createdAt

export function toRemote(kind: Kind, item: LocalItem): RemoteItem {
  return { id: item.id, kind, json: JSON.stringify(item), updatedAt: stampOf(item), deleted: false }
}
export const tombstone = (id: string, kind: Kind, at: number): RemoteItem => ({ id, kind, json: '', updatedAt: at, deleted: true })

/** Parse and validate a remote item; null if it is malformed (never trust the server blindly). */
export function fromRemote(r: RemoteItem): LocalItem | null {
  try {
    const raw: unknown = JSON.parse(r.json)
    const schema = r.kind === 'resume' ? ResumeSchema : r.kind === 'job' ? JobSchema : CoverLetterSchema
    const parsed = schema.safeParse(raw)
    return parsed.success && parsed.data.id === r.id ? (parsed.data as LocalItem) : null
  } catch {
    return null
  }
}

const entries = (d: LocalDoc): { kind: Kind; item: LocalItem }[] => [
  ...d.resumes.map((item) => ({ kind: 'resume' as const, item })),
  ...d.jobs.map((item) => ({ kind: 'job' as const, item })),
  ...d.letters.map((item) => ({ kind: 'letter' as const, item })),
]

export interface Plan {
  /** Items to write into this device's stores. */
  upserts: { kind: Kind; item: LocalItem }[]
  removals: { kind: Kind; id: string }[]
  /** Items to write to the cloud. */
  push: RemoteItem[]
}

/**
 * Decide what to change on each side. Per item, the newer edit wins (ties keep this device's copy).
 * `known` maps ids that were in sync last time to their timestamp, so an item that disappeared
 * locally is recognised as a deletion on this device and pushed as one (instead of being re-downloaded).
 */
export function planSync(local: LocalDoc, remote: Map<string, RemoteItem>, known: Record<string, number>, now = Date.now()): Plan {
  const plan: Plan = { upserts: [], removals: [], push: [] }
  const localById = new Map(entries(local).map((e) => [e.item.id, e]))

  for (const r of remote.values()) {
    const l = localById.get(r.id)
    if (!l) {
      if (r.deleted) continue
      if (r.id in known) {
        // Synced before, gone here: deleted on this device. Deletion wins.
        plan.push.push(tombstone(r.id, r.kind, now))
        continue
      }
      const item = fromRemote(r)
      if (item) plan.upserts.push({ kind: r.kind, item })
      continue
    }
    const sl = stampOf(l.item)
    if (r.deleted) {
      if (sl > r.updatedAt) plan.push.push(toRemote(l.kind, l.item)) // edited after it was deleted elsewhere: keep
      else plan.removals.push({ kind: l.kind, id: r.id })
    } else if (r.updatedAt > sl) {
      const item = fromRemote(r)
      if (item) plan.upserts.push({ kind: r.kind, item })
    } else if (sl > r.updatedAt) {
      plan.push.push(toRemote(l.kind, l.item))
    }
  }
  for (const [id, l] of localById) if (!remote.has(id)) plan.push.push(toRemote(l.kind, l.item))
  return plan
}

/** Timestamps of everything that exists after the plan was applied (becomes `known`). */
export function knownAfter(local: LocalDoc, plan: Plan): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of entries(local)) out[e.item.id] = stampOf(e.item)
  for (const u of plan.upserts) out[u.item.id] = stampOf(u.item)
  for (const r of plan.removals) delete out[r.id]
  for (const p of plan.push) if (p.deleted) delete out[p.id]
  return out
}

/** Apply a plan's local part to a document (pure; the engine writes the result to the stores). */
export function applyLocal(local: LocalDoc, plan: Plan): LocalDoc {
  const removed = new Set(plan.removals.map((r) => r.id))
  const merge = <T extends LocalItem>(list: T[], kind: Kind): T[] => {
    const incoming = new Map(plan.upserts.filter((u) => u.kind === kind).map((u) => [u.item.id, u.item as T]))
    const kept = list.filter((i) => !removed.has(i.id)).map((i) => incoming.get(i.id) ?? i)
    const added = [...incoming.values()].filter((i) => !list.some((x) => x.id === i.id))
    return [...kept, ...added]
  }
  const byNewest = <T extends { createdAt: number }>(xs: T[]) => [...xs].sort((a, b) => b.createdAt - a.createdAt)
  return { resumes: byNewest(merge(local.resumes, 'resume')), jobs: merge(local.jobs, 'job'), letters: byNewest(merge(local.letters, 'letter')) }
}
