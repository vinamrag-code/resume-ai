import { getLlm } from '@/lib/llm'
import { emailPrompt } from '@/lib/prompts'
import type { EmailKind } from '@/lib/prompts'
import { resumeToText } from '@/lib/resume'
import type { CoverTone } from '@/types/job'
import type { Resume } from '@/types/resume'

export interface EmailRequest {
  /** Resume to draw on; without one, `background` and `candidateName` come from the user. */
  resume?: Resume
  background?: string
  candidateName?: string
  jobTitle: string
  company: string
  jobDescription: string
  kind: EmailKind
  tone: CoverTone
  recipientName: string
  attachments: string[]
}

/** Streams an email ("Subject: ..." then body); `onToken` receives each chunk. Resolves with the full text. */
export function streamEmail(req: EmailRequest, onToken: (t: string) => void, signal?: AbortSignal): Promise<string> {
  const messages = emailPrompt({
    resumeText: req.resume ? resumeToText(req.resume.content) : (req.background ?? ''),
    jobTitle: req.jobTitle,
    company: req.company,
    jobDescription: req.jobDescription,
    kind: req.kind,
    tone: req.tone,
    candidateName: req.resume?.content.contact.name ?? req.candidateName ?? '',
    links: (req.resume?.content.contact.links ?? []).map((l) => l.url).filter(Boolean),
    recipientName: req.recipientName,
    attachments: req.attachments,
  })
  return getLlm().stream(messages, onToken, { signal, temperature: 0.6 })
}
