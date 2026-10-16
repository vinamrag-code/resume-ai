import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { extractJson, generateJson } from './json'
import type { ChatMessage, LlmClient } from './types'

const msgs: ChatMessage[] = [{ role: 'user', content: 'hi' }]
const schema = z.object({ name: z.string(), age: z.number() })

function scripted(replies: string[]): LlmClient & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = []
  return {
    calls,
    chat: async (m) => {
      calls.push(m)
      return replies[calls.length - 1] ?? ''
    },
    stream: async () => '',
    testConnection: async () => ({ ok: true, models: [], message: '' }),
  }
}

describe('extractJson', () => {
  it('handles fences and surrounding chatter', () => {
    expect(JSON.parse(extractJson('Sure!\n```json\n{"a":1}\n```\nDone'))).toEqual({ a: 1 })
    expect(JSON.parse(extractJson('Here you go: {"a":[1,2]} thanks'))).toEqual({ a: [1, 2] })
  })
})

describe('generateJson', () => {
  it('returns validated data on first success without retrying', async () => {
    const llm = scripted(['{"name":"Ada","age":36}'])
    expect(await generateJson(llm, msgs, schema)).toEqual({ name: 'Ada', age: 36 })
    expect(llm.calls).toHaveLength(1)
  })

  it('retries once with feedback when JSON is invalid', async () => {
    const llm = scripted(['not json at all', '{"name":"Ada","age":36}'])
    expect(await generateJson(llm, msgs, schema)).toEqual({ name: 'Ada', age: 36 })
    expect(llm.calls).toHaveLength(2)
    const retry = llm.calls[1]!
    expect(retry.at(-2)).toEqual({ role: 'assistant', content: 'not json at all' })
    expect(retry.at(-1)?.content).toMatch(/not valid JSON/)
  })

  it('retries when the shape fails zod validation', async () => {
    const llm = scripted(['{"name":"Ada","age":"old"}', '{"name":"Ada","age":36}'])
    await generateJson(llm, msgs, schema)
    expect(llm.calls[1]!.at(-1)?.content).toMatch(/age/)
  })

  it('throws invalid-json after the single retry fails', async () => {
    const llm = scripted(['nope', '{"name":1}'])
    await expect(generateJson(llm, msgs, schema)).rejects.toMatchObject({ kind: 'invalid-json' })
    expect(llm.calls).toHaveLength(2)
  })
})
