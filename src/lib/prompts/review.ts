import type { ChatMessage } from '@/lib/llm/types'

export interface ReviewItem {
  index: number
  label: string
  before: string
  after: string
}

/** Second-pass intent check: did the proposed edits do everything the user asked, and nothing more? */
export function reviewPrompt(request: string, reply: string, items: ReviewItem[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You check a resume assistant's proposed edits against what the user actually asked for.
1. Split the user's message into the separate things it asks for (adding, removing, rewording, fixing a field, layout, and so on).
2. "missing": every separate ask that NO proposed edit carries out. Do not count an ask the assistant is rightly asking a question about, or one it said it cannot do. Describe each missing ask in a short phrase, using the user's words.
3. "unrequested": the index of every proposed edit that the user did not ask for and that the request does not clearly need.
Be strict about both, but never flag an edit that is simply how an ask gets done (for example a skills edit for "add Go to my skills").
Return ONLY JSON: {"missing":["..."],"unrequested":[0]} with empty arrays when everything matches.`,
    },
    {
      role: 'user',
      content: `User's message:
"""
${request.slice(0, 3000)}
"""

Assistant's reply to the user:
"""
${reply.slice(0, 2000)}
"""

Proposed edits:
${JSON.stringify(items, null, 1)}`,
    },
  ]
}
