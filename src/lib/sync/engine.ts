import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuth } from '@/lib/auth/store'
import { useCoverLetters } from '@/store/coverLetters'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { idsOf, mergeDocs, sameDoc, withDeletions } from './merge'
import { emptyDoc, SyncDocSchema } from './schema'
import type { SyncDoc } from './schema'

interface SyncMeta {
  /** Account the local data was last synced with. */
  account: string | null
  rev: number
  lastIds: string[]
  tombstones: Record<string, number>
}

export const useSyncMeta = create<SyncMeta>()(
  persist(() => ({ account: null, rev: 0, lastIds: [], tombstones: {} }) as SyncMeta, { name: 'resume-ai:sync' }),
)

export type SyncState = 'off' | 'idle' | 'syncing' | 'error'
interface SyncStatus {
  state: SyncState
  lastSynced: number | null
  error: string | null
}
export const useSyncStatus = create<SyncStatus>()(() => ({ state: 'off', lastSynced: null, error: null }))

const setStatus = (p: Partial<SyncStatus>) => useSyncStatus.setState(p)

export function collectLocal(tombstones: Record<string, number> = {}): SyncDoc {
  return { resumes: useResumes.getState().resumes, jobs: useJobs.getState().jobs, letters: useCoverLetters.getState().letters, tombstones }
}

let applying = false
function applyToStores(doc: SyncDoc): void {
  applying = true
  try {
    useResumes.setState({ resumes: doc.resumes })
    useJobs.setState({ jobs: doc.jobs })
    useCoverLetters.setState({ letters: doc.letters })
  } finally {
    applying = false
  }
}

export function clearLocalData(): void {
  applyToStores(emptyDoc())
}

interface Reply {
  rev: number
  data: unknown
}
async function api(method: 'GET' | 'PUT' | 'DELETE', body?: unknown): Promise<{ status: number; json: Reply | null }> {
  const res = await fetch('/api/sync', { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, json: (await res.json().catch(() => null)) as Reply | null }
}

let running: Promise<void> | null = null
let queued = false

/** Pull the cloud copy, merge it with this device, apply the result locally and push it back. */
export function syncNow(): Promise<void> {
  if (running) {
    queued = true
    return running
  }
  running = (async () => {
    setStatus({ state: 'syncing', error: null })
    try {
      const email = useAuth.getState().user?.email
      if (!email) return setStatus({ state: 'off' })
      let meta = useSyncMeta.getState()
      if (meta.account && meta.account !== email) {
        // A different account signed in on this browser: never mix the two accounts' data.
        clearLocalData()
        useSyncMeta.setState({ account: email, rev: 0, lastIds: [], tombstones: {} })
        meta = useSyncMeta.getState()
      }
      let local = withDeletions(collectLocal(meta.tombstones), meta.lastIds)
      for (let attempt = 0; attempt < 4; attempt++) {
        const got = await api('GET')
        if (got.status === 401) throw new Error('Your session expired. Sign in again to keep syncing.')
        if (got.status !== 200 || !got.json) throw new Error('Could not reach cloud sync.')
        const remoteParsed = got.json.data === null ? { success: true as const, data: emptyDoc() } : SyncDocSchema.safeParse(got.json.data)
        if (!remoteParsed.success) throw new Error('Cloud data is in an unexpected format.')
        const merged = mergeDocs(local, remoteParsed.data)
        applyToStores(merged)
        let rev = got.json.rev
        if (got.json.data === null || !sameDoc(merged, remoteParsed.data)) {
          const put = await api('PUT', { baseRev: rev, data: merged })
          if (put.status === 409) {
            local = merged // someone else wrote in between: merge again on top of what we have
            continue
          }
          if (put.status !== 200 || !put.json) throw new Error('Could not save to the cloud.')
          rev = put.json.rev
        }
        useSyncMeta.setState({ account: email, rev, lastIds: idsOf(merged), tombstones: merged.tombstones })
        setStatus({ state: 'idle', lastSynced: Date.now(), error: null })
        return
      }
      throw new Error('Sync kept conflicting. Try again in a moment.')
    } catch (e) {
      setStatus({ state: 'error', error: e instanceof Error ? e.message : 'Sync failed.' })
    }
  })().finally(() => {
    running = null
    if (queued) {
      queued = false
      void syncNow()
    }
  })
  return running
}

/** Delete this account's cloud copy (local data is kept). */
export async function deleteCloudData(): Promise<boolean> {
  const r = await api('DELETE')
  if (r.status === 200) useSyncMeta.setState({ rev: 0, lastIds: [], tombstones: {} })
  return r.status === 200
}

/**
 * Start syncing while signed in: an immediate sync, a short debounce after local changes,
 * and a refresh when the tab becomes visible again or every minute. Returns a stop function.
 */
export function startSync(debounceMs = 2000): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    if (applying) return
    clearTimeout(timer)
    timer = setTimeout(() => void syncNow(), debounceMs)
  }
  const unsubs = [useResumes.subscribe(schedule), useJobs.subscribe(schedule), useCoverLetters.subscribe(schedule)]
  const onVisible = () => document.visibilityState === 'visible' && void syncNow()
  document.addEventListener('visibilitychange', onVisible)
  const interval = setInterval(onVisible, 60_000)
  void syncNow()
  return () => {
    clearTimeout(timer)
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
    unsubs.forEach((u) => u())
    setStatus({ state: 'off' })
  }
}
