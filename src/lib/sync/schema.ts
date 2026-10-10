import { z } from 'zod'
import { CoverLetterSchema, JobSchema } from '../../types/job'
import { ResumeSchema } from '../../types/resume'

/** Everything that is synced for one account. `tombstones` maps a deleted item's id to when it was deleted. */
export const SyncDocSchema = z.object({
  resumes: z.array(ResumeSchema),
  jobs: z.array(JobSchema),
  letters: z.array(CoverLetterSchema),
  tombstones: z.record(z.string(), z.number()).default({}),
})
export type SyncDoc = z.infer<typeof SyncDocSchema>

export const emptyDoc = (): SyncDoc => ({ resumes: [], jobs: [], letters: [], tombstones: {} })
