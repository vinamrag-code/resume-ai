import type { ChatMessage } from '@/lib/llm/types'
import { TRUTHFULNESS_RULES } from './truthfulness'

export interface BankBuildItem {
  id: string
  kind: string
  title: string
  org: string
  bullets: string[]
  skills: string[]
}

export interface BankBuildInput {
  jobTitle: string
  company: string
  jobDescription: string
  items: BankBuildItem[]
  currentSummary: string
  /** Most bullets to keep per item. */
  perItem: number
}

/** Ask the model to write a resume for a job using ONLY the retrieved experience-bank items. */
export function bankBuildPrompt(i: BankBuildInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You build a job-specific resume from the candidate's experience bank. You are given a few items already chosen as relevant. Reword their bullets for the job and write a summary, using ONLY facts in the items.
${TRUTHFULNESS_RULES}
Return ONLY a JSON object:
{
  "summary": "2-3 sentence summary built only from the items, or null to keep the current one",
  "items": [{ "id": "<item id>", "bullets": [{ "from": 0, "text": "reworded bullet" }] }],
  "skills": ["skills from the items' skills lists, most job-relevant first"] or null
}
Rules for "items":
- Include every item once, using its exact "id".
- Each bullet is a rewording of ONE source bullet; "from" is that bullet's zero-based index in the item. Use at most ${i.perItem} bullets per item and put the most job-relevant first.
- Keep every number, name, tool and claim from the source bullet and add none. Start with a strong action verb and keep it to one line where possible.
- Do not copy phrases from the job description unless the source bullet honestly says the same thing.
Skills: only terms that appear in the items' "skills" lists or bullets.

EXAMPLE (source bullet: "Built dashboards in React used by the team"; job wants React, TypeScript, AWS):
- GOOD: { "from": 0, "text": "Built React dashboards used by the internal team" }
- BAD: { "from": 0, "text": "Built React and TypeScript dashboards on AWS serving 10,000 users" } (invents TypeScript, AWS and a number)`,
    },
    {
      role: 'user',
      content: `Target role: ${i.jobTitle || '(not given)'}${i.company ? ` at ${i.company}` : ''}

Job description:
"""
${i.jobDescription.slice(0, 6000)}
"""

Current summary (may be empty): ${i.currentSummary || '(none)'}

Experience bank items:
${JSON.stringify(i.items)}`,
    },
  ]
}
