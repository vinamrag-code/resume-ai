import type { ChatMessage } from '@/lib/llm'
import type { ChatTurn } from '@/types/chat'
import { visibleText } from './chatLogic'

/** How much past conversation is sent with each request (characters; roughly 6,000 tokens). */
export const HISTORY_CHAR_BUDGET = 24_000

/** Providers cap a request's message count (Groq: 40 including the system prompt), so long chats are cut well below that. */
export const HISTORY_MAX_MESSAGES = 30

const STATUS_LABEL = { accepted: 'APPLIED by the user', pending: 'not applied yet', rejected: 'rejected' } as const

/**
 * One saved turn as a plain chat message that any model can read. The machine-readable edits block is
 * replaced by a short note of what was suggested and what happened to each suggestion, so the next
 * model knows the outcome without re-reading raw JSON.
 */
export function turnToMessage(t: ChatTurn): ChatMessage {
  if (t.role === 'user') return { role: 'user', content: t.content }
  const text = visibleText(t.content)
  const suggestions = t.changes.map((c) => `${c.label} (${STATUS_LABEL[c.status]})`)
  const note = suggestions.length ? `\n[Edits suggested in this reply: ${suggestions.join('; ')}]` : ''
  return { role: 'assistant', content: `${text}${note}`.trim() || '(no text)' }
}

export interface History {
  messages: ChatMessage[]
  /** True if older messages were left out to fit the budget. */
  truncated: boolean
}

/**
 * The conversation to send to the model: oldest turns are dropped first when it is too long (in characters or in messages), the latest
 * message is always kept, and the history always starts with a user message (some models require it).
 * It only contains plain text, so a different model can pick the conversation up at any point.
 */
export function buildHistory(turns: ChatTurn[], budget = HISTORY_CHAR_BUDGET, maxMessages = HISTORY_MAX_MESSAGES): History {
  const every = turns.filter((t) => t.role === 'user' || t.content.trim() !== '' || t.changes.length > 0).map(turnToMessage)
  const all = every.slice(-maxMessages)
  let total = 0
  let start = all.length
  for (let i = all.length - 1; i >= 0; i--) {
    total += all[i]!.content.length
    if (total > budget && start < all.length) break
    start = i
  }
  let kept = all.slice(start)
  while (kept.length > 1 && kept[0]!.role !== 'user') kept = kept.slice(1)
  return { messages: kept, truncated: kept.length < every.length }
}

/** Plain-language list of the edits the user already applied, so the model never re-suggests them. */
export function appliedSummary(turns: ChatTurn[]): string {
  const applied = turns.flatMap((t) => t.changes).filter((c) => c.status === 'accepted').map((c) => c.label)
  return [...new Set(applied)].slice(-30).join('; ')
}
