import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { extractJson, generateJson } from './json'
import { OllamaClient } from './ollama'
import { LlmError } from './types'
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

describe('OllamaClient', () => {
  afterEach(() => vi.unstubAllGlobals())
  const client = new OllamaClient({ baseUrl: 'http://localhost:11434/', model: 'llama3.1:8b' })

  it('maps network failure to a friendly unreachable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(client.chat(msgs)).rejects.toMatchObject({ kind: 'unreachable' })
    const status = await client.testConnection()
    expect(status.ok).toBe(false)
    expect(status.message).toMatch(/OLLAMA_ORIGINS/)
  })

  it('sends model, format and trims the base url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: 'ok' } })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await client.chat(msgs, { json: true })).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:11434/api/chat')
    const body = JSON.parse(init.body as string) as { model: string; format: string; stream: boolean }
    expect(body).toMatchObject({ model: 'llama3.1:8b', format: 'json', stream: false })
  })

  it('parses streamed NDJSON split across chunks', async () => {
    const enc = new TextEncoder()
    const parts = ['{"message":{"content":"Hel"}}\n{"mess', 'age":{"content":"lo"}}\n{"done":true}\n']
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        parts.forEach((p) => c.enqueue(enc.encode(p)))
        c.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)))
    const tokens: string[] = []
    const full = await client.stream(msgs, (t) => tokens.push(t))
    expect(tokens).toEqual(['Hel', 'lo'])
    expect(full).toBe('Hello')
  })

  it('reports a missing model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('model "x" not found', { status: 404 })))
    await expect(client.chat(msgs)).rejects.toBeInstanceOf(LlmError)
    await expect(client.chat(msgs)).rejects.toMatchObject({ kind: 'model-missing' })
  })

  it('testConnection lists models and checks the configured one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ models: [{ name: 'llama3.1:8b' }] }))))
    expect((await client.testConnection()).ok).toBe(true)
    const other = new OllamaClient({ baseUrl: 'http://localhost:11434', model: 'mistral' })
    const s = await other.testConnection()
    expect(s.ok).toBe(false)
    expect(s.message).toMatch(/ollama pull mistral/)
  })
})
