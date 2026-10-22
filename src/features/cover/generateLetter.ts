import { getLlm } from '@/lib/llm'
import { coverLetterPrompt } from '@/lib/prompts'
import { resumeToText } from '@/lib/resume'
import type { CoverTone } from '@/types/job'
import type { Resume } from '@/types/resume'

export interface LetterRequest {
  /** Resume to draw on; without one, `background` and `candidateName` come from the user. */
  resume?: Resume
  background?: string
  candidateName?: string
  jobTitle: string
  company: string
  jobDescription: string
  tone: CoverTone
}

/** Streams a cover letter; `onToken` receives each chunk. Resolves with the full text. */
export function streamCoverLetter(req: LetterRequest, onToken: (t: string) => void, signal?: AbortSignal): Promise<string> {
  const messages = coverLetterPrompt({
    resumeText: req.resume ? resumeToText(req.resume.content) : (req.background ?? ''),
    jobTitle: req.jobTitle,
    company: req.company,
    jobDescription: req.jobDescription,
    tone: req.tone,
    candidateName: req.resume?.content.contact.name ?? req.candidateName ?? '',
  })
  return getLlm().stream(messages, onToken, { signal, temperature: 0.6 })
}
