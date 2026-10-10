import { z } from 'zod'
import { CoverLetterSchema, JobSchema } from '@/types/job'
import { ResumeSchema } from '@/types/resume'
import { useCoverLetters } from './coverLetters'
import { useJobs } from './jobs'
import { useResumes } from './resumes'
import { useSettings } from './settings'

export const BackupSchema = z.object({
  app: z.literal('resume-ai'),
  version: z.literal(1),
  exportedAt: z.string(),
  settings: z.object({
    provider: z.enum(['ollama', 'openrouter', 'groq']).default('ollama'),
    ollamaUrl: z.string(),
    model: z.string(),
    theme: z.enum(['system', 'light', 'dark']),
  }),
  resumes: z.array(ResumeSchema),
  jobs: z.array(JobSchema),
  letters: z.array(CoverLetterSchema),
})
export type Backup = z.infer<typeof BackupSchema>

export function createBackup(): Backup {
  const { provider, ollamaUrl, model, theme } = useSettings.getState()
  return {
    app: 'resume-ai',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { provider, ollamaUrl, model, theme },
    resumes: useResumes.getState().resumes,
    jobs: useJobs.getState().jobs,
    letters: useCoverLetters.getState().letters,
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
  useSettings.getState().update(b.settings)
  return { ok: true, counts: { resumes: b.resumes.length, jobs: b.jobs.length, letters: b.letters.length } }
}
