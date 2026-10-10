import type { ChatMessage } from '@/lib/llm/types'
import { TRUTHFULNESS_RULES } from './truthfulness'

export function parseResumePrompt(text: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You convert raw resume text into structured JSON. Copy facts exactly as written; do not summarise, embellish or add anything.
${TRUTHFULNESS_RULES}
Return ONLY a JSON object with this shape (use empty strings / empty arrays when something is missing):
{
  "contact": { "name": "", "email": "", "phone": "", "location": "", "links": [{ "label": "LinkedIn", "url": "" }] },
  "summary": "",
  "experience": [{ "company": "", "title": "", "location": "", "start": "", "end": "", "bullets": [""] }],
  "education": [{ "school": "", "degree": "", "field": "", "start": "", "end": "", "details": [""] }],
  "projects": [{ "name": "", "link": "", "bullets": [""] }],
  "skills": [""],
  "certifications": [{ "name": "", "issuer": "", "date": "" }]
}
Rules: one bullet per accomplishment line; "end" is "Present" for current roles; skills is a flat list of individual skills.`,
    },
    { role: 'user', content: `Resume text:\n"""\n${text.slice(0, 24000)}\n"""` },
  ]
}
