import type { CoverTone } from '@/types/job'
import type { ChatMessage } from '@/lib/llm/types'
import { TRUTHFULNESS_RULES } from './truthfulness'

export const EMAIL_KINDS = ['application', 'follow-up', 'thank-you'] as const
export type EmailKind = (typeof EMAIL_KINDS)[number]

const KINDS: Record<EmailKind, string> = {
  application: 'A first email applying for the role, sent to a recruiter or hiring manager. State the role, give two or three relevant strengths from the resume, and invite next steps.',
  'follow-up': 'A polite follow-up on an application already sent. Restate interest in the role, add one relevant strength from the resume, and ask about the status.',
  'thank-you': 'A thank-you note after an interview. Thank them, mention the role, reaffirm fit with one relevant strength from the resume, and invite next steps.',
}

const TONES: Record<CoverTone, string> = {
  formal: 'Formal and professional. About 150-200 words.',
  friendly: 'Warm and personable while staying professional. About 130-180 words.',
  concise: 'Short and direct. Under 100 words.',
}

export interface EmailInput {
  resumeText: string
  jobTitle: string
  company: string
  jobDescription: string
  kind: EmailKind
  tone: CoverTone
  candidateName: string
  recipientName: string
  /** Names of files the user will attach, e.g. "resume", "cover letter". */
  attachments: string[]
}

/** The first line of the reply is "Subject: ..."; the rest is the body. See `splitEmail`. */
export function emailPrompt(i: EmailInput): ChatMessage[] {
  const attach = i.attachments.length
    ? `The user will attach their ${i.attachments.join(' and ')}; mention the attachment${i.attachments.length > 1 ? 's' : ''} in one natural sentence.`
    : 'Nothing is attached; do not mention attachments.'
  return [
    {
      role: 'system',
      content: `You write short job-search emails from a candidate's resume (or, if they have none, a short description of their background) and a job description.
${TRUTHFULNESS_RULES}
Email type: ${KINDS[i.kind]}
Tone: ${TONES[i.tone]}
${attach}
Output plain text only. The first line is "Subject: <subject>", then a blank line, then the email: a greeting, 2-3 short paragraphs, a closing and the candidate's name. No markdown, no placeholders like [Company]. Draw only on experience that appears in the resume or background.`,
    },
    {
      role: 'user',
      content: `Candidate: ${i.candidateName || '(name not given)'}
Recipient: ${i.recipientName || '(name not given; use a neutral greeting such as "Hello,")'}
Role: ${i.jobTitle || '(not given)'}${i.company ? ` at ${i.company}` : ''}

Job description:
"""
${i.jobDescription.slice(0, 4000)}
"""

Resume or background:
"""
${i.resumeText.slice(0, 6000)}
"""`,
    },
  ]
}
