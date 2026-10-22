import { afterEach, describe, expect, it, vi } from 'vitest'
import { LlmError } from './types'
import type { LlmClient } from './types'
import { defaultModels } from '@/store/settings'
import { ChainLlmClient, LangChainClient } from '@/lib/chain'
import { createLlm, setServerModels, setServerProviders } from './index'
import { OpenAiCompatibleClient } from './openai'

const cfg = { baseUrl: 'https://api.example.com/v1/', model: 'm1', apiKey: 'sk-test', label: 'Example', supportsJsonFormat: true }
const proxyCfg = { baseUrl: '/api/llm/groq', model: 'm1', label: 'Groq', supportsJsonFormat: true }
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
    for (const [status, kind] of [[401, 'auth'], [503, 'auth'], [429, 'rate-limit'], [404, 'model-missing']] as const) {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('x', { status })))
      await expect(new OpenAiCompatibleClient(cfg).chat(msgs)).rejects.toMatchObject({ kind })
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(new OpenAiCompatibleClient(cfg).chat(msgs)).rejects.toMatchObject({ kind: 'unreachable' })
    expect((await new OpenAiCompatibleClient(cfg).testConnection()).ok).toBe(false)
  })

  it('proxy mode sends no Authorization header (the server adds the key)', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await new OpenAiCompatibleClient(proxyCfg).chat(msgs)).toBe('hi')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/llm/groq/chat/completions')
    expect(init.headers as Record<string, string>).not.toHaveProperty('Authorization')
  })

  it('createLlm picks the client for the provider', () => {
    const base = { models: defaultModels() }
    expect(createLlm({ ...base, provider: 'groq' })).toBeInstanceOf(OpenAiCompatibleClient)
    expect(createLlm({ ...base, provider: 'inception' })).toBeInstanceOf(OpenAiCompatibleClient)
    expect(createLlm({ ...base, provider: 'auto' })).toBeInstanceOf(ChainLlmClient)
    expect(createLlm({ ...base, provider: 'auto' }, 'checker')).toBeInstanceOf(LangChainClient)
  })
})

function fake(name: string, behaviour: 'ok' | LlmError): LlmClient & { used: number } {
  return {
    used: 0,
    chat(this: { used: number }) { this.used++; return behaviour === 'ok' ? Promise.resolve(name) : Promise.reject(behaviour) },
    stream(this: { used: number }, _m, onToken) { this.used++; if (behaviour === 'ok') { onToken(name); return Promise.resolve(name) } return Promise.reject(behaviour) },
    testConnection: async () => ({ ok: behaviour === 'ok', models: [name], message: name }),
  }
}

describe('LangChainClient (withFallbacks)', () => {
  const down = new LlmError('rate-limit', 'limited')
  it('uses the first provider when it works', async () => {
    const a = fake('A', 'ok'); const b = fake('B', 'ok')
    expect(await new LangChainClient([a, b]).chat(msgs)).toBe('A')
    expect(b.used).toBe(0)
  })
  it('falls back on provider errors, for chat and for streams that have not started', async () => {
    const a = fake('A', down); const b = fake('B', 'ok')
    expect(await new LangChainClient([a, b]).chat(msgs)).toBe('B')
    const tokens: string[] = []
    expect(await new LangChainClient([fake('A', down), fake('B', 'ok')]).stream(msgs, (t) => tokens.push(t))).toBe('B')
    expect(tokens).toEqual(['B'])
  })
  it('throws the first provider\'s error when all fail, and never retries cancellation', async () => {
    await expect(new LangChainClient([fake('A', down), fake('B', new LlmError('auth', 'bad key'))]).chat(msgs)).rejects.toMatchObject({ kind: 'rate-limit' })
    const ctl = new AbortController()
    const cancelled: LlmClient = { chat: async () => { ctl.abort(); throw new DOMException('x', 'AbortError') }, stream: async () => '', testConnection: async () => ({ ok: true, models: [], message: '' }) }
    const b = fake('B', 'ok')
    await expect(new LangChainClient([cancelled, b]).chat(msgs, { signal: ctl.signal })).rejects.toMatchObject({ kind: 'aborted' })
    expect(b.used).toBe(0)
  })
  it('gives a helpful error when no provider is configured', async () => {
    await expect(new LangChainClient([]).chat(msgs)).rejects.toMatchObject({ kind: 'auth', message: expect.stringContaining('GROQ_API_KEY') })
    expect((await new LangChainClient([]).testConnection()).ok).toBe(false)
  })
  it('does not switch providers once text was streamed', async () => {
    const partial: LlmClient = { chat: async () => '', stream: async (_m, onToken) => { onToken('par'); throw down }, testConnection: async () => ({ ok: true, models: [], message: '' }) }
    const b = fake('B', 'ok')
    await expect(new LangChainClient([partial, b]).stream(msgs, () => {})).rejects.toBe(down)
    expect(b.used).toBe(0)
  })
})

describe('Auto mode ordering (server without an Inception key)', () => {
  afterEach(() => setServerProviders(null))
  const settings = { provider: 'auto' as const, models: defaultModels() }
  const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
  const firstUrl = async (role: 'primary' | 'checker') => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string) => { seen.push(u); return ok() }))
    await createLlm(settings, role).chat(msgs)
    return seen[0]
  }
  it('primary is Groq; the checker is OpenRouter (an independent model)', async () => {
    setServerProviders(new Set(['groq', 'openrouter']))
    expect(await firstUrl('primary')).toContain('/api/llm/groq')
    expect(await firstUrl('checker')).toContain('/api/llm/openrouter')
  })
  it('uses whichever single provider the server has for every role', async () => {
    setServerProviders(new Set(['openrouter']))
    expect(await firstUrl('primary')).toContain('/api/llm/openrouter')
    expect(await firstUrl('checker')).toContain('/api/llm/openrouter')
  })
  it('tries Groq first and falls through to OpenRouter on 503', async () => {
    setServerProviders(new Set(['groq', 'openrouter']))
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string) => { seen.push(u); return u.includes('groq') ? new Response('x', { status: 503 }) : ok() }))
    expect(await createLlm(settings).chat(msgs)).toBe('ok')
    expect(seen.map((u) => u.split('/')[3])).toEqual(['groq', 'openrouter'])
  })
  it('falls back to OpenRouter when Groq is rate limited', async () => {
    setServerProviders(new Set(['groq', 'openrouter']))
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string) => (u.includes('groq') ? new Response('x', { status: 429 }) : new Response(JSON.stringify({ choices: [{ message: { content: 'from-openrouter' } }] })))))
    expect(await createLlm(settings).chat(msgs)).toBe('from-openrouter')
  })
})

describe('Auto mode with Inception on the server', () => {
  afterEach(() => setServerProviders(null))
  const settings = { provider: 'auto' as const, models: defaultModels() }
  const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
  const urls = async (role: 'primary' | 'checker', json = false) => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string) => { seen.push(u.split('/')[3]!); return ok() }))
    await createLlm(settings, role).chat(msgs, { json })
    return seen
  }
  it('answers go to Inception (JSON tasks skip the editing steps) and the checker stays on OpenRouter first', async () => {
    setServerProviders(new Set(['groq', 'openrouter', 'inception']))
    expect(await urls('primary', true)).toEqual(['inception'])
    expect(await urls('checker')).toEqual(['openrouter'])
  })
  it('falls back to OpenRouter when Inception fails', async () => {
    setServerProviders(new Set(['groq', 'openrouter', 'inception']))
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string) => { seen.push(u.split('/')[3]!); return u.includes('inception') ? new Response('x', { status: 429 }) : ok() }))
    expect(await createLlm(settings).chat(msgs, { json: true })).toBe('ok')
    expect(seen).toEqual(['inception', 'openrouter'])
  })
})

describe('Auto mode honours admin-configured pipeline roles', () => {
  afterEach(() => { setServerProviders(null); setServerModels(null) })
  const settings = { provider: 'auto' as const, models: defaultModels() }
  const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
  const urls = async (role: 'primary' | 'checker', json = false) => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string) => { seen.push(u.split('/')[3]!); return ok() }))
    await createLlm(settings, role).chat(msgs, { json })
    return seen
  }
  it('writes with whichever provider the admin assigned to the writer role', async () => {
    setServerProviders(new Set(['groq', 'openrouter', 'inception']))
    setServerModels({ allowed: {} as never, defaults: {} as never, roles: { writer: 'groq', editor: 'inception', fallback: 'openrouter' } })
    expect(await urls('primary', true)).toEqual(['groq'])
  })
  it('sends the checker to the admin-assigned fallback role first', async () => {
    setServerProviders(new Set(['groq', 'openrouter', 'inception']))
    setServerModels({ allowed: {} as never, defaults: {} as never, roles: { writer: 'inception', editor: 'openrouter', fallback: 'groq' } })
    expect(await urls('checker')).toEqual(['groq'])
  })
})
