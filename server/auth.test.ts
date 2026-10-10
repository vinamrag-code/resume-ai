// @vitest-environment node
import { createSign, generateKeyPairSync } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiHandler } from './api'
import { loadConfig } from './config'
import { resetGoogleKeyCache, verifyGoogleIdToken } from './google'
import { createSessionToken, parseCookies, verifySessionToken } from './session'
import { FileStore } from './store'
import { emptyDoc } from '../src/lib/sync/schema'
import { newResume } from '../src/lib/resume'

const SECRET = 'x'.repeat(40)
const CLIENT = 'client-123.apps.googleusercontent.com'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
const jwks = () => new Response(JSON.stringify({ keys: [jwk] }))

function idToken(claims: Record<string, unknown> = {}, opts: { kid?: string; key?: typeof privateKey } = {}): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = enc({ alg: 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' })
  const body = enc({ iss: 'https://accounts.google.com', aud: CLIENT, sub: 'u-1', email: 'ada@example.com', email_verified: true, name: 'Ada', picture: 'https://p/x.png', exp: Math.floor(Date.now() / 1000) + 3600, ...claims })
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(opts.key ?? privateKey).toString('base64url')
  return `${head}.${body}.${sig}`
}

beforeEach(() => resetGoogleKeyCache())

describe('session tokens', () => {
  const cfg = { sessionSecret: SECRET, sessionDays: 7 }
  const user = { sub: 'u1', email: 'a@b.c', name: 'A', picture: '' }
  it('round-trips, and rejects tampering, wrong secrets and expiry', () => {
    const t = createSessionToken(user, cfg, 1000)
    expect(verifySessionToken(t, cfg, 2000)).toEqual(user)
    expect(verifySessionToken(t, { sessionSecret: 'y'.repeat(40) }, 2000)).toBeNull()
    const [body, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ ...user, sub: 'admin', exp: 9e15 })).toString('base64url')
    expect(verifySessionToken(`${forged}.${sig}`, cfg, 2000)).toBeNull()
    expect(verifySessionToken(`${body}.`, cfg)).toBeNull()
    expect(verifySessionToken(t, cfg, 1000 + 8 * 86_400_000)).toBeNull()
    expect(verifySessionToken('garbage', cfg)).toBeNull()
  })
  it('parses cookies', () => {
    expect(parseCookies('a=1; ra_session=abc%3D; b=2')).toMatchObject({ a: '1', ra_session: 'abc=', b: '2' })
  })
})

describe('Google ID token verification', () => {
  const verify = (token: string) => verifyGoogleIdToken(token, CLIENT, async () => jwks())
  it('accepts a valid token', async () => {
    expect(await verify(idToken())).toMatchObject({ sub: 'u-1', email: 'ada@example.com', name: 'Ada' })
  })
  it('rejects wrong audience, issuer, expiry, unverified email, bad signature and unknown key', async () => {
    await expect(verify(idToken({ aud: 'other' }))).rejects.toThrow(/different app/)
    await expect(verify(idToken({ iss: 'https://evil.example' }))).rejects.toThrow(/issuer/)
    await expect(verify(idToken({ exp: 1 }))).rejects.toThrow(/expired/)
    await expect(verify(idToken({ email_verified: false }))).rejects.toThrow(/not verified/)
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
    await expect(verify(idToken({}, { key: other.privateKey }))).rejects.toThrow(/signature/)
    await expect(verify(idToken({}, { kid: 'nope' }))).rejects.toThrow(/Unknown signing key/)
    await expect(verify('a.b')).rejects.toThrow(/Malformed/)
  })
  it('rejects tokens that use another algorithm', async () => {
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    await expect(verify(`${enc({ alg: 'none' })}.${enc({})}.x`)).rejects.toThrow(/algorithm/)
  })
})

describe('auth, gated AI proxy and cloud sync (end to end)', () => {
  let dir = ''
  let close: (() => void) | null = null
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ra-'))
  })
  afterEach(async () => {
    close?.()
    await rm(dir, { recursive: true, force: true })
  })

  async function start(env: Record<string, string> = {}, upstream = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] })))) {
    const cfg = loadConfig({ GROQ_API_KEY: 'gk', GOOGLE_CLIENT_ID: CLIENT, SESSION_SECRET: SECRET, USER_RATE_LIMIT_PER_MINUTE: '2', ...env })
    // Google's key endpoint is faked through the global fetch used by verifyGoogleIdToken.
    vi.stubGlobal('fetch', ((u: string, init?: RequestInit) => (String(u).includes('googleapis.com') ? Promise.resolve(jwks()) : (globalThis as { __real?: typeof fetch }).__real!(u, init))) as typeof fetch)
    const { handle } = await createApiHandler(cfg, new FileStore(dir), { llmFetch: upstream })
    const server = createServer((req, res) => void handle(req, res).then((h) => !h && res.writeHead(404).end()))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    close = () => server.close()
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    return { base, cfg }
  }
  const realFetch = fetch
  beforeEach(() => {
    ;(globalThis as { __real?: typeof fetch }).__real = realFetch
  })
  afterEach(() => vi.unstubAllGlobals())

  const signIn = async (base: string, claims: Record<string, unknown> = {}) => {
    const res = await realFetch(`${base}/api/auth/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: idToken(claims) }) })
    return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (r: Response) => r.json() as Promise<any>

  it('exposes config, signs in, reports the user, and signs out', async () => {
    const { base } = await start()
    expect(await j(await realFetch(`${base}/api/auth/config`))).toEqual({ required: true, googleClientId: CLIENT })
    expect((await j(await realFetch(`${base}/api/auth/me`))).user).toBeNull()
    const { res, cookie } = await signIn(base)
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax/)
    const me = await j(await realFetch(`${base}/api/auth/me`, { headers: { cookie } }))
    expect(me.user).toEqual({ email: 'ada@example.com', name: 'Ada', picture: 'https://p/x.png' })
    expect(JSON.stringify(me)).not.toContain('u-1')
    const out = await realFetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie } })
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/)
  })

  it('rejects bad credentials and cross-origin sign-in', async () => {
    const { base } = await start()
    expect((await signIn(base, { aud: 'other' })).res.status).toBe(401)
    expect((await realFetch(`${base}/api/auth/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(400)
    expect((await realFetch(`${base}/api/auth/google`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: idToken() }) })).status).toBe(403)
  })

  it('is disabled (and everything stays open) without a client id and secret', async () => {
    const { base } = await start({ GOOGLE_CLIENT_ID: '' })
    expect(await j(await realFetch(`${base}/api/auth/config`))).toEqual({ required: false, googleClientId: '' })
    expect((await realFetch(`${base}/api/auth/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(503)
    expect((await realFetch(`${base}/api/sync`)).status).toBe(503)
  })

  it('requires sign-in for the AI proxy and limits per user instead of per IP', async () => {
    const upstream = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] })))
    const { base } = await start({}, upstream)
    const body = JSON.stringify({ model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: 'hi' }] })
    const post = (cookie?: string) => realFetch(`${base}/api/llm/groq/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body })
    const anon = await post()
    expect(anon.status).toBe(401)
    expect((await j(anon)).error.message).toMatch(/Sign in/)
    expect(upstream).not.toHaveBeenCalled()

    const { cookie: ada } = await signIn(base)
    const { cookie: bob } = await signIn(base, { sub: 'u-2', email: 'b@example.com' })
    expect((await post(ada)).status).toBe(200)
    expect((await post(ada)).status).toBe(200)
    const limited = await post(ada)
    expect(limited.status).toBe(429)
    expect(upstream).toHaveBeenCalledTimes(2)
    expect((await post(bob)).status).toBe(200) // same IP, different account: not affected
    expect((await realFetch(`${base}/api/llm/status`)).status).toBe(200) // status stays public
  })

  it('syncs per account with optimistic concurrency and deletes on request', async () => {
    const { base } = await start()
    const { cookie: a } = await signIn(base)
    const { cookie: b } = await signIn(base, { sub: 'u-2', email: 'b@example.com' })
    const put = (cookie: string, baseRev: number, data: unknown) => realFetch(`${base}/api/sync`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ baseRev, data }) })
    expect((await realFetch(`${base}/api/sync`)).status).toBe(401)
    expect(await j(await realFetch(`${base}/api/sync`, { headers: { cookie: a } }))).toEqual({ rev: 0, data: null })

    const doc = { ...emptyDoc(), resumes: [newResume('Mine')] }
    expect(await j(await put(a, 0, doc))).toEqual({ rev: 1 })
    const stale = await put(a, 0, { ...doc, resumes: [] })
    expect(stale.status).toBe(409)
    const conflict = await j(stale)
    expect(conflict.rev).toBe(1)
    expect(conflict.data.resumes[0].name).toBe('Mine')
    expect(await j(await put(a, 1, { ...doc, jobs: [] }))).toEqual({ rev: 2 })

    // Accounts are isolated.
    expect(await j(await realFetch(`${base}/api/sync`, { headers: { cookie: b } }))).toEqual({ rev: 0, data: null })
    expect((await put(a, 2, { resumes: 'nope' })).status).toBe(400)

    expect((await realFetch(`${base}/api/sync`, { method: 'DELETE', headers: { cookie: a } })).status).toBe(200)
    expect((await j(await realFetch(`${base}/api/sync`, { headers: { cookie: a } }))).data).toBeNull()
  })

  it('rejects oversized sync payloads', async () => {
    const { base } = await start({ MAX_SYNC_BYTES: '500' })
    const { cookie } = await signIn(base)
    const res = await realFetch(`${base}/api/sync`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ baseRev: 0, data: { ...emptyDoc(), resumes: [newResume('x'.repeat(1000))] } }) })
    expect(res.status).toBe(413)
  })
})
