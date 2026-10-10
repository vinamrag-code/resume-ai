import type { ChatMessage } from '@/lib/llm/types'

export interface VerifyItem {
  index: number
  before: string
  after: string
}

/** Second-pass fact check: finds claims in rewrites that the original resume does not support. */
export function verifyPrompt(resumeText: string, items: VerifyItem[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You are a strict fact checker for resume edits. For each rewrite, decide whether the "after" text states any employer, job title, date, degree, tool, technology, skill, number or achievement that is NOT supported by the original resume text or the "before" text.
Rewording, reordering, tightening and stronger verbs are fine. New facts are not.
Return ONLY JSON: {"results":[{"index":0,"unsupported":["the exact unsupported claim", "..."]}]}
Use an empty array when everything is supported. Include every index.`,
    },
    {
      role: 'user',
      content: `Original resume:
"""
${resumeText.slice(0, 8000)}
"""

Rewrites to check:
${JSON.stringify(items, null, 1)}`,
    },
  ]
}
