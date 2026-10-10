// @vitest-environment node
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLlmHandler } from './proxy'
import { loadConfig } from './config'
import { createModelSource, envModels, parseModelDoc } from './modelConfig'

const FB = { FIREBASE_API_KEY: 'k', FIREBASE_AUTH_DOMAIN: 'x.firebaseapp.com', FIREBASE_PROJECT_ID: 'proj', FIREBASE_APP_ID: '1:1:web:1' }
const arr = (...v: string[]) => ({ arrayValue: { values: v.map((stringValue) => ({ stringValue })) } })
const doc = (fields: Record<string, unknown>) => ({ fields })
const adminDoc = doc({
  groq: arr('openai/gpt-oss-120b', 'llama-3.3-70b-versatile'),
  openrouter: arr('a/b:free', 'c/d:free'),
  defaults: { mapValue: { fields: { groq: { stringValue: 'llama-3.3-70b-versatile' }, openrouter: { stringValue: 'not-in-list' } } } },
})

describe('model config parsing', () => {
  const env = envModels(loadConfig({}))
  it('uses the admin list and defaults, falling back to the first model for an invalid default', () => {
    const m = parseModelDoc(adminDoc, env)
    expect(m.allowed.groq).toEqual(['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'])
    expect(m.defaults.groq).toBe('llama-3.3-70b-versatile')
    expect(m.defaults.openrouter).toBe('a/b:free')
  })
  it('keeps environment defaults for missing or invalid data and drops bad model names', () => {
    expect(parseModelDoc(null, env)).toEqual(env)
    expect(parseModelDoc(doc({}), env)).toEqual(env)
    const m = parseModelDoc(doc({ groq: arr('ok/model', 'bad name with spaces', '$(rm -rf)', 'x'.repeat(200)) }), env)
    expect(m.allowed.groq).toEqual(['ok/model'])
    expect(m.allowed.openrouter).toEqual(env.allowed.openrouter)
  })
  it('caps the list size', () => {
    const many = Array.from({ length: 50 }, (_, i) => `m/${i}`)
    expect(parseModelDoc(doc({ groq: arr(...many) }), env).allowed.groq).toHaveLength(20)
  })
})

describe('model source', () => {
  const cfg = loadConfig(FB)
  it('reads config/models from Firestore with the public API key, and caches it', async () => {
    let t = 0
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify(adminDoc)))
    const get = createModelSource(cfg, f, () => t)
    expect((await get()).allowed.groq).toContain('llama-3.3-70b-versatile')
    await get()
    expect(f).toHaveBeenCalledTimes(1)
    expect(String(f.mock.calls[0]![0])).toBe('https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents/config/models?key=k')
    t += 31_000
    await get()
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('falls back to environment defaults when there is no document or Firestore is unreachable, and keeps the last good value', async () => {
    const env = envModels(cfg)
    expect(await createModelSource(cfg, async () => new Response('{}', { status: 404 }))()).toEqual(env)
    expect(await createModelSource(cfg, async () => { throw new Error('offline') })()).toEqual(env)
    let t = 0
    let fail = false
    const get = createModelSource(cfg, async () => { if (fail) throw new Error('offline'); return new Response(JSON.stringify(adminDoc)) }, () => t)
    const good = await get()
    fail = true
    t += 60_000
    expect(await get()).toEqual(good)
    expect(await createModelSource(loadConfig({}))()).toEqual(envModels(loadConfig({})))
  })
})

describe('proxy uses the admin-managed models', () => {
  let close: (() => void) | null = null
  afterEach(() => close?.())
  const models = async () => ({ allowed: { groq: ['new/model-a', 'new/model-b'], openrouter: ['x/y:free'] }, defaults: { groq: 'new/model-b', openrouter: 'x/y:free' } })

  async function start() {
    const upstream = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] })))
    const handle = createLlmHandler(loadConfig({ GROQ_API_KEY: 'g' }), upstream, undefined, undefined, { models })
    const server = createServer((req, res) => void handle(req, res).then((h) => !h && res.writeHead(404).end()))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    close = () => server.close()
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const post = (model: string) =>
      fetch(`${base}/api/llm/groq/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }] }) })
    return { base, post, upstream }
  }

  it('status publishes the admin allowlist and defaults', async () => {
    const { base } = await start()
    const status = await (await fetch(`${base}/api/llm/status`)).json()
    expect(status.models).toEqual({ groq: ['new/model-a', 'new/model-b'], openrouter: ['x/y:free'] })
    expect(status.defaults).toEqual({ groq: 'new/model-b', openrouter: 'x/y:free' })
  })

  it('accepts models the admin added and refuses the old default and anything else', async () => {
    const { post, upstream } = await start()
    expect((await post('new/model-a')).status).toBe(200)
    expect(JSON.parse((upstream.mock.calls[0] as [string, RequestInit])[1].body as string).model).toBe('new/model-a')
    expect((await post('openai/gpt-oss-120b')).status).toBe(400)
    expect((await post('some/other')).status).toBe(400)
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})
