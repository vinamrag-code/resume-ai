import type { CoverTone } from '@/types/job'
import type { ChatMessage } from '@/lib/llm/types'
import { TRUTHFULNESS_RULES } from './truthfulness'

export const EMAIL_KINDS = ['application', 'follow-up', 'thank-you'] as const
export type EmailKind = (typeof EMAIL_KINDS)[number]

const KINDS: Record<EmailKind, string> = {
  application: 'A first email applying for the role, sent to a recruiter or hiring manager. State the role, show the two or three most relevant strengths from the resume, say why this role or company attracts the candidate, and invite next steps.',
  'follow-up': 'A polite follow-up on an application already sent. Restate interest in the role, add one relevant strength from the resume, and ask about the status.',
  'thank-you': 'A thank-you note after an interview. Thank them, mention the role, reaffirm fit with one relevant strength from the resume, and invite next steps.',
}

const TONES: Record<CoverTone, string> = {
  formal: 'Formal and professional. About 150-200 words.',
  friendly: 'Warm and personable while staying professional. About 130-180 words.',
  concise: 'Short and direct. Under 100 words; keep the structure but compress to one or two proof lines.',
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
  /** Contact links (GitHub, LinkedIn, portfolio) the email must include verbatim. */
  links: string[]
  /** Names of files the user will attach, e.g. "resume", "cover letter". */
  attachments: string[]
}

/** The first line of the reply is "Subject: ..."; the rest is the body. See `splitEmail`. */
export function emailPrompt(i: EmailInput): ChatMessage[] {
  const attach = i.attachments.length
    ? `The user will attach their ${i.attachments.join(' and ')}; mention the attachment${i.attachments.length > 1 ? 's' : ''} in one natural sentence ("My resume is attached").`
    : 'Nothing is attached; do not mention attachments.'
  const links = i.links.length ? `\nLinks to include verbatim: ${i.links.join(' | ')}` : ''
  return [
    {
      role: 'system',
      content: `You write short job-search emails from a candidate's resume (or, if they have none, a short description of their background) and a job description.
${TRUTHFULNESS_RULES}
EMAIL TRUTHFULNESS (on top of the rules above):
- Availability, start date, remote or on-site preference, salary expectations and referrals ("referred by X"): mention them only if the resume or background text states them. Never infer or invent them.
- Claims about the company, its team or its work must come from the job description.
- Do not claim a skill, tool or achievement the resume or background does not support.

Email type: ${KINDS[i.kind]}
Tone: ${TONES[i.tone]}
${attach}

STRUCTURE (in this order):
1. Greeting: the recipient's name if given; otherwise ${i.company ? `"Hi ${i.company} Hiring Team,"` : '"Hi Hiring Team,"'}. Never a bare "Hello," and never "Dear Sir/Madam".
2. One opening sentence: who the candidate is (course and university if the resume says), the exact role and company, and the single thing that makes them a fit, in the candidate's natural voice.
3. Two or three proof lines, each a short "Label: sentence" line (for example "Industry experience: ..." or "Projects: ..."), drawn from the resume and chosen because they match this job description. If the resume has a quantified achievement, always keep it, in plain words.
4. One line on why this role or company, using only what the job description says about them.
5. One closing line: a next step (a conversation, an interview), availability only if it is known, and a brief thank-you.
6. "Best regards," then the candidate's name, then their email on the next line.

CONTENT RULES:
- Choose the two or three resume facts that match the job description's requirements; ignore the rest of the resume.
- A student applying for an internship includes one education line (course and university; CGPA only if the resume states it).
- Include the candidate's links (GitHub, LinkedIn, portfolio) exactly as given, in a closing line or the signature.
- Name at most three or four technologies, and only ones the job description mentions. Say what the candidate built and what it does, never the architecture or a tool inventory. Every line should survive the question "so what does that do for the employer?"

LANGUAGE:
- First person, contractions welcome, warm and direct.
- Never use "I am writing to apply for", "Please find my resume attached" or "I believe I would be a great fit".

Subject: "${i.jobTitle ? i.jobTitle : 'the role'} application - ${i.candidateName || 'the candidate'}" for an application, "Following up: ${i.jobTitle ? i.jobTitle : 'role'} application" for a follow-up, "Thank you - ${i.jobTitle ? i.jobTitle : 'the role'} interview" for a thank-you note.

Output plain text only. The first line is "Subject: <subject>", then a blank line, then the email: the greeting, the structure above, the sign-off. No markdown, no placeholders like [Company].`,
    },
    {
      role: 'user',
      content: `Candidate: ${i.candidateName || '(name not given)'}${links}
Recipient: ${i.recipientName || `(name not given; greet ${i.company ? `"Hi ${i.company} Hiring Team,"` : '"Hi Hiring Team,"'})`}
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
