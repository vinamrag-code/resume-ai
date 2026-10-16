import { z } from 'zod'
import { PROVIDERS } from '@/lib/llm/providers'
import type { ProviderChoice } from '@/lib/llm/providers'
import { BankItemSchema } from '@/types/bank'
import { ChatSchema } from '@/types/chat'
import { CoverLetterSchema, JobSchema } from '@/types/job'
import { ResumeSchema } from '@/types/resume'
import { useBank } from './bank'
import { useChats } from './chats'
import { useCoverLetters } from './coverLetters'
import { useJobs } from './jobs'
import { useResumes } from './resumes'
import { useSettings } from './settings'

export const BackupSchema = z.object({
  app: z.literal('resume-ai'),
  version: z.literal(1),
  exportedAt: z.string(),
  settings: z.object({
    // A provider this version does not know (e.g. one since removed) restores as Auto.
    provider: z.string().default('auto').transform((p): ProviderChoice => (p === 'auto' || p in PROVIDERS ? (p as ProviderChoice) : 'auto')),
    models: z.record(z.string(), z.string()).default({}),
    theme: z.enum(['system', 'light', 'dark']),
  }),
  resumes: z.array(ResumeSchema),
  jobs: z.array(JobSchema),
  letters: z.array(CoverLetterSchema),
  /** Agent conversations (added later, so older backups may not have them). */
  chats: z.array(ChatSchema).default([]),
  /** Experience bank (added later, so older backups may not have it). */
  bank: z.array(BankItemSchema).default([]),
})
export type Backup = z.infer<typeof BackupSchema>

export function createBackup(): Backup {
  const { provider, models, theme } = useSettings.getState()
  return {
    app: 'resume-ai',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { provider, models, theme },
    resumes: useResumes.getState().resumes,
    jobs: useJobs.getState().jobs,
    letters: useCoverLetters.getState().letters,
    chats: useChats.getState().chats,
    bank: useBank.getState().items,
  }
}

export type ImportResult = { ok: true; counts: { resumes: number; jobs: number; letters: number } } | { ok: false; error: string }

/** Validates a backup JSON string and replaces all local data with it. */
export function restoreBackup(raw: string): ImportResult {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }
  const parsed = BackupSchema.safeParse(json)
  if (!parsed.success) {
    return { ok: false, error: 'That file is not a Resume AI backup (or it is from an incompatible version).' }
  }
  const b = parsed.data
  useResumes.setState({ resumes: b.resumes })
  useJobs.setState({ jobs: b.jobs })
  useCoverLetters.setState({ letters: b.letters })
  useChats.setState({ chats: b.chats })
  useBank.setState({ items: b.bank })
  useSettings.getState().restore(b.settings)
  return { ok: true, counts: { resumes: b.resumes.length, jobs: b.jobs.length, letters: b.letters.length } }
}
