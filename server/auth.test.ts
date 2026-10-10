// @vitest-environment node
import { createSign, generateKeyPairSync } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiHandler } from './api'
import { loadConfig } from './config'
import { resetKeyCache, verifyFirebaseIdToken } from './firebase'

const PROJECT = 'resume-ai-test'
const FIREBASE_ENV = { FIREBASE_API_KEY: 'k', FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`, FIREBASE_PROJECT_ID: PROJECT, FIREBASE_APP_ID: '1:1:web:1' }
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
const jwks = async () => new Response(JSON.stringify({ keys: [jwk] }))

function idToken(claims: Record<string, unknown> = {}, opts: { kid?: string; key?: typeof privateKey } = {}): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const head = enc({ alg: 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' })
  const body = enc({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'uid-1', iat: now - 10, exp: now + 3600, email: 'ada@example.com', email_verified: true, name: 'Ada', picture: 'https://p/x.png', ...claims })
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(opts.key ?? privateKey).toString('base64url')
  return `${head}.${body}.${sig}`
}

beforeEach(() => resetKeyCache())

describe('Firebase ID token verification', () => {
  const verify = (t: string) => verifyFirebaseIdToken(t, PROJECT, jwks)
  it('accepts a valid token', async () => {
    expect(await verify(idToken())).toEqual({ uid: 'uid-1', email: 'ada@example.com', name: 'Ada', picture: 'https://p/x.png', emailVerified: true })
    expect((await verify(idToken({ email_verified: false }))).emailVerified).toBe(false)
  })
  it('rejects wrong project, issuer, expiry, future iat, bad signature, unknown key, bad algorithm and junk', async () => {
    await expect(verify(idToken({ aud: 'other-project' }))).rejects.toThrow(/different project/)
    await expect(verify(idToken({ iss: 'https://securetoken.google.com/other' }))).rejects.toThrow(/issuer/)
    await expect(verify(idToken({ exp: 1 }))).rejects.toThrow(/expired/)
    await expect(verify(idToken({ iat: Math.floor(Date.now() / 1000) + 99999 }))).rejects.toThrow(/future/)
    await expect(verify(idToken({ sub: '' }))).rejects.toThrow(/subject/)
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
    await expect(verify(idToken({}, { key: other.privateKey }))).rejects.toThrow(/signature/)
    await expect(verify(idToken({}, { kid: 'nope' }))).rejects.toThrow(/Unknown signing key/)
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    await expect(verify(`${enc({ alg: 'none' })}.${enc({})}.x`)).rejects.toThrow(/algorithm/)
    await expect(verify('a.b')).rejects.toThrow(/Malformed/)
    await expect(verify('!!!.???.@@@')).rejects.toThrow()
  })
})

describe('API with Firebase sign-in', () => {
  let close: (() => void) | null = null
  afterEach(() => close?.())

  async function start(env: Record<string, string> = FIREBASE_ENV, upstream = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] })))) {
    const cfg = loadConfig({ GROQ_API_KEY: 'gk', USER_RATE_LIMIT_PER_MINUTE: '2', ...env })
    const handle = createApiHandler(cfg, { llmFetch: upstream, verifyFetch: jwks })
    const server = createServer((req, res) => void handle(req, res).then((h) => !h && res.writeHead(404).end()))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    close = () => server.close()
    return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, upstream }
  }
  const body = JSON.stringify({ model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: 'hi' }] })
  const post = (base: string, token?: string) => fetch(`${base}/api/llm/groq/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body })

  it('publishes the public Firebase config so the page needs no rebuild', async () => {
    const { base } = await start()
    expect(await (await fetch(`${base}/api/auth/config`)).json()).toEqual({
      required: true,
      firebase: { apiKey: 'k', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, appId: '1:1:web:1' },
    })
  })

  it('is off (everything open, per-IP limits) when the Firebase config is incomplete', async () => {
    const { base } = await start({ FIREBASE_PROJECT_ID: PROJECT })
    expect(await (await fetch(`${base}/api/auth/config`)).json()).toEqual({ required: false, firebase: null })
    expect((await post(base)).status).toBe(200)
  })

  it('requires a valid Firebase token for the AI proxy', async () => {
    const { base, upstream } = await start()
    const anon = await post(base)
    expect(anon.status).toBe(401)
    expect((await anon.json()).error.message).toMatch(/Sign in/)
    expect((await post(base, 'garbage')).status).toBe(401)
    expect((await post(base, idToken({ aud: 'other-project' }))).status).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
    expect((await post(base, idToken())).status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('refuses accounts whose email is not verified, even with a valid token', async () => {
    const { base, upstream } = await start()
    expect((await post(base, idToken({ email_verified: false }))).status).toBe(401)
    expect((await post(base, idToken({ email_verified: undefined }))).status).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
    expect((await post(base, idToken({ email_verified: true }))).status).toBe(200)
  })

  it('limits per account instead of per IP', async () => {
    const { base, upstream } = await start()
    const ada = idToken()
    const bob = idToken({ sub: 'uid-2', email: 'bob@example.com' })
    expect((await post(base, ada)).status).toBe(200)
    expect((await post(base, ada)).status).toBe(200)
    expect((await post(base, ada)).status).toBe(429)
    expect(upstream).toHaveBeenCalledTimes(2)
    expect((await post(base, bob)).status).toBe(200)
    expect((await fetch(`${base}/api/llm/status`)).status).toBe(200) // status stays public
  })

  it('no longer exposes sign-in or sync endpoints of its own', async () => {
    const { base } = await start()
    expect((await fetch(`${base}/api/auth/google`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/api/sync`)).status).toBe(404)
  })
})

describe('members versus admins on the AI proxy', () => {
  let close: (() => void) | null = null
  afterEach(() => close?.())
  const models = async () => ({ allowed: { groq: ['m/default', 'm/other'], openrouter: ['o/x:free'] }, defaults: { groq: 'm/default', openrouter: 'o/x:free' } })

  async function start(adminUids: string[]) {
    const cfg = loadConfig({ GROQ_API_KEY: 'gk', ...FIREBASE_ENV })
    const upstream = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] })))
    const { createLlmHandler } = await import('./proxy')
    const handle = createLlmHandler(cfg, upstream, undefined, undefined, { verifyFetch: jwks, models, isAdmin: async (uid) => adminUids.includes(uid) })
    const server = createServer((req, res) => void handle(req, res).then((h) => !h && res.writeHead(404).end()))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    close = () => server.close()
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const post = (token: string, model: string) =>
      fetch(`${base}/api/llm/groq/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }] }) })
    return { post, upstream }
  }

  it('lets members use only the admin default, and admins any allowed model', async () => {
    const { post, upstream } = await start(['uid-admin'])
    const member = idToken({ sub: 'uid-member' })
    const admin = idToken({ sub: 'uid-admin' })
    expect((await post(member, 'm/default')).status).toBe(200)
    const refused = await post(member, 'm/other')
    expect(refused.status).toBe(400)
    expect((await refused.json()).error.message).toContain('m/default')
    expect((await post(admin, 'm/other')).status).toBe(200)
    expect((await post(admin, 'm/default')).status).toBe(200)
    expect((await post(admin, 'not/allowed')).status).toBe(400)
    expect(upstream).toHaveBeenCalledTimes(3)
  })
})
