// @vitest-environment node
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from './config'
import { createLlmHandler, sanitizeRequest } from './proxy'
import { RateLimiter } from './rateLimit'

const cfg = loadConfig({ GROQ_API_KEY: 'gk-secret', OPENROUTER_API_KEY: 'ok-secret', RATE_LIMIT_PER_MINUTE: '3', RATE_LIMIT_PER_DAY: '5' })
const goodBody = { model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: 'hi' }] }
let close: (() => void) | null = null
afterEach(() => close?.())

async function start(config = cfg, upstream = vi.fn()) {
  const handle = createLlmHandler(config, upstream as never, new RateLimiter(config.perMinute, config.perDay))
  const server = createServer((req, res) => void handle(req, res).then((h) => !h && res.writeHead(404).end()))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  close = () => server.close()
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  return { base, post, upstream }
}
const okUpstream = () => vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }), { headers: { 'content-type': 'application/json' } }))

describe('rate limiter', () => {
  it('limits per minute and per day, and recovers', () => {
    let t = 0
    const l = new RateLimiter(2, 3, () => t)
    expect(l.check('a').ok).toBe(true)
    expect(l.check('a').ok).toBe(true)
    expect(l.check('a')).toMatchObject({ ok: false, reason: 'minute' })
    expect(l.check('b').ok).toBe(true)
    t += 61_000
    expect(l.check('a').ok).toBe(true)
    expect(l.check('a')).toMatchObject({ ok: false, reason: 'day' })
    t += 86_400_000
    expect(l.check('a').ok).toBe(true)
  })
})

describe('sanitizeRequest', () => {
  it('keeps only allowed fields and clamps values', () => {
    const r = sanitizeRequest({ ...goodBody, temperature: 9, max_tokens: 999999, tools: [{}], stream: true, response_format: { type: 'json_object' } }, 'groq', cfg)
    expect(r).toMatchObject({ ok: true })
    if (r.ok) {
      expect(r.body).toEqual({ model: goodBody.model, messages: goodBody.messages, stream: true, temperature: 2, max_tokens: 4096, response_format: { type: 'json_object' } })
    }
  })
  it('rejects disallowed models, bad messages and oversized prompts', () => {
    expect(sanitizeRequest({ ...goodBody, model: 'some/expensive-model' }, 'groq', cfg)).toMatchObject({ ok: false })
    expect(sanitizeRequest({ model: goodBody.model, messages: [] }, 'groq', cfg)).toMatchObject({ ok: false })
    expect(sanitizeRequest({ model: goodBody.model, messages: [{ role: 'tool', content: 'x' }] }, 'groq', cfg)).toMatchObject({ ok: false })
    expect(sanitizeRequest({ model: goodBody.model, messages: [{ role: 'user', content: 'x'.repeat(cfg.maxChars + 1) }] }, 'groq', cfg)).toMatchObject({ ok: false })
    expect(sanitizeRequest(null, 'groq', cfg)).toMatchObject({ ok: false })
  })
})

describe('LLM proxy', () => {
  it('reports which providers are configured without revealing keys', async () => {
    const { base } = await start(loadConfig({ GROQ_API_KEY: 'gk-secret' }))
    const text = await (await fetch(`${base}/api/llm/status`)).text()
    expect(JSON.parse(text).providers).toEqual({ groq: true, openrouter: false, inception: false })
    expect(text).not.toContain('gk-secret')
  })

  it('injects the server key, forwards a sanitized body, and returns the reply', async () => {
    const upstream = okUpstream()
    const { post } = await start(cfg, upstream)
    const res = await post('/api/llm/groq/chat/completions', { ...goodBody, tools: [{ evil: true }] })
    expect(res.status).toBe(200)
    expect((await res.json()).choices[0].message.content).toBe('hello')
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gk-secret')
    expect(JSON.parse(init.body as string)).not.toHaveProperty('tools')
  })

  it('routes Inception with its own key and allowlist, and answers 503 without a key', async () => {
    const upstream = okUpstream()
    const withKey = loadConfig({ INCEPTION_API_KEY: 'ik-secret' })
    const { post } = await start(withKey, upstream)
    expect((await post('/api/llm/inception/chat/completions', { ...goodBody, model: 'mercury-2' })).status).toBe(200)
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.inceptionlabs.ai/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ik-secret')
    expect((await post('/api/llm/inception/chat/completions', goodBody)).status).toBe(400) // a Groq model is not allowed here
    const { post: post2 } = await start(loadConfig({}), okUpstream())
    expect((await post2('/api/llm/inception/chat/completions', { ...goodBody, model: 'mercury-2' })).status).toBe(503)
  })

  it('streams the upstream response through', async () => {
    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode('data: {"a":1}\n\n')); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close() } })
    const { post } = await start(cfg, vi.fn().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/event-stream' } })))
    const res = await post('/api/llm/openrouter/chat/completions', { ...goodBody, model: 'nvidia/nemotron-3-super-120b-a12b:free', stream: true })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(await res.text()).toBe('data: {"a":1}\n\ndata: [DONE]\n\n')
  })

  it('rate limits per client with Retry-After', async () => {
    const { post } = await start(cfg, okUpstream())
    for (let i = 0; i < 3; i++) expect((await post('/api/llm/groq/chat', goodBody)).status).toBe(200)
    const blocked = await post('/api/llm/groq/chat', goodBody)
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('rejects bad requests without calling the provider', async () => {
    const upstream = okUpstream()
    const { post, base } = await start(cfg, upstream)
    expect((await post('/api/llm/groq/chat', { ...goodBody, model: 'x/other' })).status).toBe(400)
    expect((await post('/api/llm/groq/chat', 'not json')).status).toBe(400)
    expect((await post('/api/llm/groq/chat', goodBody, { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await fetch(`${base}/api/llm/groq/chat`)).status).toBe(405)
    expect((await fetch(`${base}/api/llm/unknown/chat`, { method: 'POST' })).status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('rejects oversized bodies and unconfigured providers', async () => {
    const small = loadConfig({ GROQ_API_KEY: 'k', MAX_BODY_BYTES: '100' })
    const a = await start(small, okUpstream())
    expect((await a.post('/api/llm/groq/chat', { ...goodBody, messages: [{ role: 'user', content: 'x'.repeat(500) }] })).status).toBe(413)
    close?.()
    const b = await start(loadConfig({ GROQ_API_KEY: 'k' }), okUpstream())
    expect((await b.post('/api/llm/openrouter/chat', { ...goodBody, model: 'nvidia/nemotron-3-super-120b-a12b:free' })).status).toBe(503)
  })

  it('passes provider errors through without leaking the key', async () => {
    const { post } = await start(cfg, vi.fn().mockResolvedValue(new Response('{"error":{"message":"rate limited"}}', { status: 429, headers: { 'retry-after': '7' } })))
    const res = await post('/api/llm/groq/chat', goodBody)
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('7')
    expect(await res.text()).not.toContain('gk-secret')
  })

  it('turns an unreachable provider into a 502', async () => {
    const { post } = await start(cfg, vi.fn().mockRejectedValue(new Error('network')))
    expect((await post('/api/llm/groq/chat', goodBody)).status).toBe(502)
  })
})
