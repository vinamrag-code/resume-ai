import type { z } from 'zod'
import { LlmError } from './types'
import type { ChatMessage, ChatOptions, LlmClient } from './types'

/** Pull the first JSON object/array out of model output (handles ```json fences and chatter). */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced?.[1] ?? text).trim()
  const start = body.search(/[{[]/)
  if (start === -1) return body
  const open = body[start]!
  const close = open === '{' ? '}' : ']'
  const end = body.lastIndexOf(close)
  return end > start ? body.slice(start, end + 1) : body.slice(start)
}

function tryParse<T>(text: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(extractJson(text))
  } catch {
    return { ok: false, error: 'The reply was not valid JSON.' }
  }
  const result = schema.safeParse(raw)
  if (result.success) return { ok: true, data: result.data }
  const issues = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ')
  return { ok: false, error: `The JSON did not match the required shape (${issues}).` }
}

/**
 * Ask for JSON, validate with zod, and retry once with the validation error fed back to the model.
 * Throws LlmError('invalid-json') if the second attempt also fails.
 */
export async function generateJson<T>(
  client: LlmClient,
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  options: Omit<ChatOptions, 'json'> = {},
): Promise<T> {
  const first = await client.chat(messages, { ...options, json: true })
  const a = tryParse(first, schema)
  if (a.ok) return a.data

  const retryMessages: ChatMessage[] = [
    ...messages,
    { role: 'assistant', content: first },
    {
      role: 'user',
      content: `${a.error} Reply again with ONLY a corrected JSON object that matches the requested shape. No commentary.`,
    },
  ]
  const second = await client.chat(retryMessages, { ...options, json: true, temperature: 0 })
  const b = tryParse(second, schema)
  if (b.ok) return b.data
  throw new LlmError('invalid-json', `The model did not return valid structured data. ${b.error} Try again or use a larger model.`)
}
