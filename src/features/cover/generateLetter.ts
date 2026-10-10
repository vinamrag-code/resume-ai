import { getLlm } from '@/lib/llm'
import { coverLetterPrompt } from '@/lib/prompts'
import { resumeToText } from '@/lib/resume'
import type { CoverTone } from '@/types/job'
import type { Resume } from '@/types/resume'

export interface LetterRequest {
  resume: Resume
  jobTitle: string
  company: string
  jobDescription: string
  tone: CoverTone
}

/** Streams a cover letter; `onToken` receives each chunk. Resolves with the full text. */
export function streamCoverLetter(req: LetterRequest, onToken: (t: string) => void, signal?: AbortSignal): Promise<string> {
  const messages = coverLetterPrompt({
    resumeText: resumeToText(req.resume.content),
    jobTitle: req.jobTitle,
    company: req.company,
    jobDescription: req.jobDescription,
    tone: req.tone,
    candidateName: req.resume.content.contact.name,
  })
  return getLlm().stream(messages, onToken, { signal, temperature: 0.6 })
}
