import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { makeId } from '@/lib/id'
import { JOB_STATUSES } from '@/types/job'
import type { Job, JobStatus } from '@/types/job'

export interface JobState {
  jobs: Job[]
  add: (input: Partial<Omit<Job, 'id' | 'createdAt' | 'order'>> & Pick<Job, 'title' | 'company'>) => Job
  update: (id: string, patch: Partial<Omit<Job, 'id'>>) => void
  remove: (id: string) => void
  /** Move a job to a column at a given position (drag and drop). */
  move: (id: string, status: JobStatus, index: number) => void
}

export const today = () => new Date().toISOString().slice(0, 10)

/** Pure reorder used by the store and tested directly. */
export function moveJob(jobs: Job[], id: string, status: JobStatus, index: number): Job[] {
  const moving = jobs.find((j) => j.id === id)
  if (!moving) return jobs
  const columnOf = (st: JobStatus, list: Job[]) => list.filter((j) => j.status === st).sort((a, b) => a.order - b.order)
  const rest = jobs.filter((j) => j.id !== id)
  const target = columnOf(status, rest)
  target.splice(Math.max(0, Math.min(index, target.length)), 0, { ...moving, status })
  const result: Job[] = []
  for (const st of JOB_STATUSES) {
    const col = st === status ? target : columnOf(st, rest)
    col.forEach((j, i) => result.push({ ...j, order: i }))
  }
  return result
}

export const useJobs = create<JobState>()(
  persist(
    (set, get) => ({
      jobs: [],
      add: (input) => {
        const status = input.status ?? 'saved'
        const order = get().jobs.filter((j) => j.status === status).length
        const job: Job = {
          url: '',
          date: today(),
          notes: '',
          description: '',
          ...input,
          status,
          id: makeId(),
          createdAt: Date.now(),
          order,
        }
        set((s) => ({ jobs: [...s.jobs, job] }))
        return job
      },
      update: (id, patch) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),
      remove: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
      move: (id, status, index) => set((s) => ({ jobs: moveJob(s.jobs, id, status, index) })),
    }),
    { name: 'resume-ai:jobs', partialize: (s) => ({ jobs: s.jobs }) },
  ),
)
