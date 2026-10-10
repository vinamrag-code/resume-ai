import { z } from 'zod'

export const JOB_STATUSES = ['saved', 'applied', 'interviewing', 'offer', 'rejected'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
}

export const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  url: z.string(),
  /** ISO date (yyyy-mm-dd) of application or save. */
  date: z.string(),
  status: z.enum(JOB_STATUSES),
  notes: z.string(),
  description: z.string(),
  resumeId: z.string().optional(),
  coverLetterId: z.string().optional(),
  createdAt: z.number(),
  /** Last edit time, used to resolve cloud-sync conflicts. */
  updatedAt: z.number().optional(),
  order: z.number(),
})
export type Job = z.infer<typeof JobSchema>

export const CoverLetterSchema = z.object({
  id: z.string(),
  title: z.string(),
  resumeId: z.string(),
  jobId: z.string().optional(),
  tone: z.enum(['formal', 'friendly', 'concise']),
  jobTitle: z.string(),
  company: z.string(),
  jobDescription: z.string(),
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type CoverLetter = z.infer<typeof CoverLetterSchema>
export type CoverTone = CoverLetter['tone']
