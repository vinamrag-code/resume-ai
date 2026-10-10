import type { ChatMessage } from '@/lib/llm/types'
import { TRUTHFULNESS_RULES } from './truthfulness'

export interface TailorInput {
  resumeJson: string
  jobTitle: string
  company: string
  jobDescription: string
}

export function tailorPrompt(i: TailorInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You are a careful resume editor. You tailor an existing resume to a job description by rewording and re-prioritising ONLY facts already present.
${TRUTHFULNESS_RULES}
Return ONLY a JSON object:
{
  "summary": "rewritten summary, or null to leave unchanged",
  "summaryReason": "why",
  "bullets": [{ "section": "experience" | "projects", "entry": 0, "bullet": 0, "text": "rewritten bullet", "reason": "why" }],
  "skills": ["same skills as the resume, reordered so the most job-relevant come first"] or null,
  "skillsReason": "why"
}
"entry" and "bullet" are the zero-based indexes shown in the resume JSON. Only include bullets that genuinely benefit from a change (at most 8). Start bullets with a strong action verb, keep them to one line where possible, and mirror the job's terminology only where it honestly applies. Never add skills that are not already listed.`,
    },
    {
      role: 'user',
      content: `Target role: ${i.jobTitle || '(not given)'}${i.company ? ` at ${i.company}` : ''}

Job description:
"""
${i.jobDescription.slice(0, 8000)}
"""

Resume JSON:
${i.resumeJson}`,
    },
  ]
}
