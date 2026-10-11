import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useChats } from '@/store/chats'
import { useCoverLetters } from '@/store/coverLetters'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { applyLocal, knownAfter, planSync } from './items'
import type { LocalDoc, RemoteItem } from './items'

/** Everything the engine needs from the cloud. Implemented by Firestore (and by a fake in tests). */
export interface Remote {
  subscribe(onItems: (items: RemoteItem[]) => void, onError: (e: Error) => void): () => void
  write(items: RemoteItem[]): Promise<void>
  deleteAll(): Promise<void>
}

interface SyncMeta {
  /** Account the local data was last synced with. */
  account: string | null
  /** Items that were in sync last time (id -> timestamp), used to detect local deletions. */
  known: Record<string, number>
}

export const useSyncMeta = create<SyncMeta>()(
  persist(() => ({ account: null, known: {} }) as SyncMeta, {
    name: 'resume-ai:sync',
    version: 3,
    migrate: () => ({ account: null, known: {} }),
  }),
)

export type SyncState = 'off' | 'idle' | 'syncing' | 'error'
interface SyncStatus {
  state: SyncState
  lastSynced: number | null
  error: string | null
}
export const useSyncStatus = create<SyncStatus>()(() => ({ state: 'off', lastSynced: null, error: null }))
const setStatus = (p: Partial<SyncStatus>) => useSyncStatus.setState(p)

export function collectLocal(): LocalDoc {
  return { resumes: useResumes.getState().resumes, jobs: useJobs.getState().jobs, letters: useCoverLetters.getState().letters, chats: useChats.getState().chats }
}

let applying = false
function writeLocal(doc: LocalDoc): void {
  applying = true
  try {
    useResumes.setState({ resumes: doc.resumes })
    useJobs.setState({ jobs: doc.jobs })
    useCoverLetters.setState({ letters: doc.letters })
    useChats.setState({ chats: doc.chats })
  } finally {
    applying = false
  }
}
export function clearLocalData(): void {
  writeLocal({ resumes: [], jobs: [], letters: [], chats: [] })
}

let active: { remote: Remote; reconcile: () => Promise<void>; stop: () => void } | null = null

/** Re-run the comparison now (the "Sync now" button). */
export async function syncNow(): Promise<void> {
  await active?.reconcile()
}

/** Delete this account's cloud copy (local data is kept). */
export async function deleteCloudData(): Promise<boolean> {
  if (!active) return false
  // Stop syncing first, otherwise the engine would see the empty cloud copy and upload everything again.
  const { remote, stop } = active
  stop()
  try {
    await remote.deleteAll()
    useSyncMeta.setState({ known: {} })
    return true
  } catch {
    return false
  }
}

/**
 * Start syncing for the signed-in user: listen to the cloud copy, compare it with this device whenever
 * either side changes (debounced), apply the newer edit per item and push local changes.
 * Returns a stop function.
 */
export function startSync(remote: Remote, account: string, debounceMs = 1200): () => void {
  const meta = useSyncMeta.getState()
  if (meta.account && meta.account !== account) {
    // A different account signed in on this browser: never mix the two accounts' data.
    clearLocalData()
    useSyncMeta.setState({ account, known: {} })
  } else if (meta.account !== account) {
    useSyncMeta.setState({ account })
  }

  let latest: Map<string, RemoteItem> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let busy: Promise<void> | null = null
  let again = false

  const run = async () => {
    if (stopped || !latest) return
    setStatus({ state: 'syncing', error: null })
    try {
      const local = collectLocal()
      const plan = planSync(local, latest, useSyncMeta.getState().known)
      const next = applyLocal(local, plan)
      if (plan.upserts.length || plan.removals.length) writeLocal(next)
      if (plan.push.length) {
        await remote.write(plan.push)
        for (const p of plan.push) latest.set(p.id, p) // our own writes echo back and will compare equal
      }
      useSyncMeta.setState({ known: knownAfter(local, plan) })
      setStatus({ state: 'idle', lastSynced: Date.now(), error: null })
    } catch (e) {
      setStatus({ state: 'error', error: e instanceof Error ? e.message : 'Sync failed.' })
    }
  }
  const reconcile = (): Promise<void> => {
    if (busy) {
      again = true
      return busy
    }
    busy = run().finally(() => {
      busy = null
      if (again) {
        again = false
        void reconcile()
      }
    })
    return busy
  }
  const schedule = () => {
    if (applying || stopped) return
    clearTimeout(timer)
    timer = setTimeout(() => void reconcile(), debounceMs)
  }

  setStatus({ state: 'syncing', error: null })
  const unsubRemote = remote.subscribe(
    (items) => {
      latest = new Map(items.map((i) => [i.id, i]))
      void reconcile()
    },
    (e) => setStatus({ state: 'error', error: e.message }),
  )
  const unsubs = [useResumes.subscribe(schedule), useJobs.subscribe(schedule), useCoverLetters.subscribe(schedule), useChats.subscribe(schedule)]
  const stop = () => {
    stopped = true
    clearTimeout(timer)
    unsubRemote()
    unsubs.forEach((u) => u())
    if (active?.remote === remote) active = null
    setStatus({ state: 'off' })
  }
  active = { remote, reconcile, stop }
  return stop
}

/** Start syncing with Firestore for a user. */
export async function startFirestoreSync(uid: string, email: string): Promise<() => void> {
  const { createFirestoreRemote } = await import('./firestoreRemote')
  return startSync(await createFirestoreRemote(uid), email || uid)
}
