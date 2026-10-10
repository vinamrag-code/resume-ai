import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLlm } from './index'
import { OpenAiCompatibleClient } from './openai'

const cfg = { baseUrl: 'https://api.example.com/v1/', model: 'm1', apiKey: 'sk-test', label: 'Example', supportsJsonFormat: true }
const msgs = [{ role: 'user' as const, content: 'hi' }]

afterEach(() => vi.unstubAllGlobals())

describe('OpenAiCompatibleClient', () => {
  it('sends bearer auth, model and json format, and reads the reply', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await new OpenAiCompatibleClient(cfg).chat(msgs, { json: true })).toBe('{"a":1}')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body as string) as { model: string; response_format?: unknown; messages: { role: string }[] }
    expect(body.model).toBe('m1')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[0]!.role).toBe('system')
  })

  it('omits response_format when unsupported', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] })))
    vi.stubGlobal('fetch', fetchMock)
    await new OpenAiCompatibleClient({ ...cfg, supportsJsonFormat: false }).chat(msgs, { json: true })
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).not.toHaveProperty('response_format')
  })

  it('parses SSE streams, ignoring comments and [DONE]', async () => {
    const enc = new TextEncoder()
    const parts = [': PROCESSING\n\ndata: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choi', 'ces":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n']
    const stream = new ReadableStream<Uint8Array>({ start(c) { parts.forEach((p) => c.enqueue(enc.encode(p))); c.close() } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)))
    const tokens: string[] = []
    expect(await new OpenAiCompatibleClient(cfg).stream(msgs, (t) => tokens.push(t))).toBe('Hello')
    expect(tokens).toEqual(['Hel', 'lo'])
  })

  it('maps missing key, 401, 429 and network failure to friendly errors', async () => {
    await expect(new OpenAiCompatibleClient({ ...cfg, apiKey: '' }).chat(msgs)).rejects.toMatchObject({ kind: 'auth', message: expect.stringContaining('.env') })
    for (const [status, kind] of [[401, 'auth'], [429, 'rate-limit'], [404, 'model-missing']] as const) {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('x', { status })))
      await expect(new OpenAiCompatibleClient(cfg).chat(msgs)).rejects.toMatchObject({ kind })
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(new OpenAiCompatibleClient(cfg).chat(msgs)).rejects.toMatchObject({ kind: 'unreachable' })
    expect((await new OpenAiCompatibleClient(cfg).testConnection()).ok).toBe(false)
  })

  it('createLlm picks the client for the provider', () => {
    expect(createLlm({ provider: 'ollama', ollamaUrl: 'http://x', model: 'm' }).constructor.name).toBe('OllamaClient')
    expect(createLlm({ provider: 'groq', ollamaUrl: '', model: 'm' })).toBeInstanceOf(OpenAiCompatibleClient)
  })
})
