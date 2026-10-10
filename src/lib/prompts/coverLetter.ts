import type { CoverTone } from '@/types/job'
import type { ChatMessage } from '@/lib/llm/types'
import { TRUTHFULNESS_RULES } from './truthfulness'

const TONES: Record<CoverTone, string> = {
  formal: 'Formal and professional. Measured, polished sentences. About 300-350 words.',
  friendly: 'Warm, personable and enthusiastic while staying professional. About 280-330 words.',
  concise: 'Concise and punchy. Short paragraphs, no filler. Under 200 words.',
}

export interface CoverLetterInput {
  resumeText: string
  jobTitle: string
  company: string
  jobDescription: string
  tone: CoverTone
  candidateName: string
}

export function coverLetterPrompt(i: CoverLetterInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You write tailored cover letters from a candidate's resume and a job description.
${TRUTHFULNESS_RULES}
Tone: ${TONES[i.tone]}
Output only the letter as plain text: a greeting, 2-4 short paragraphs, a closing and the candidate's name. No markdown, no placeholders like [Company], no subject line. Draw only on experience that appears in the resume.`,
    },
    {
      role: 'user',
      content: `Candidate: ${i.candidateName || '(name not given)'}
Role: ${i.jobTitle || '(not given)'}${i.company ? ` at ${i.company}` : ''}

Job description:
"""
${i.jobDescription.slice(0, 6000)}
"""

Resume:
"""
${i.resumeText.slice(0, 8000)}
"""`,
    },
  ]
}
