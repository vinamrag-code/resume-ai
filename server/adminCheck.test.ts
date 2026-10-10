// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createAdminCheck } from './adminCheck'
import { loadConfig } from './config'

const cfg = loadConfig({ FIREBASE_API_KEY: 'k', FIREBASE_AUTH_DOMAIN: 'x', FIREBASE_PROJECT_ID: 'proj', FIREBASE_APP_ID: '1' })

describe('admin check', () => {
  it("reads the user's own admins document with their token", async () => {
    const f = vi.fn(async (_u: string, _i: RequestInit) => new Response('{}', { status: 200 }))
    expect(await createAdminCheck(cfg, f)('uid-1', 'the-token')).toBe(true)
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe('https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents/admins/uid-1')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer the-token')
  })
  it('is false for a missing document, denied access, errors and a missing project', async () => {
    for (const status of [404, 403, 500]) expect(await createAdminCheck(cfg, async () => new Response('{}', { status }))('u', 't')).toBe(false)
    expect(await createAdminCheck(cfg, async () => { throw new Error('offline') })('u', 't')).toBe(false)
    expect(await createAdminCheck(loadConfig({}), async () => new Response('{}'))('u', 't')).toBe(false)
  })
  it('caches answers briefly, errors for less time, and never mixes users', async () => {
    let t = 0
    const f = vi.fn(async (_u: string, _i: RequestInit) => new Response('{}', { status: 200 }))
    const check = createAdminCheck(cfg, f, () => t)
    await check('a', 't')
    await check('a', 't')
    expect(f).toHaveBeenCalledTimes(1)
    await check('b', 't')
    expect(f).toHaveBeenCalledTimes(2)
    t += 61_000
    await check('a', 't')
    expect(f).toHaveBeenCalledTimes(3)
    const failing = vi.fn(async (_u: string, _i: RequestInit): Promise<Response> => { throw new Error('x') })
    const c2 = createAdminCheck(cfg, failing, () => t)
    await c2('z', 't')
    t += 11_000
    await c2('z', 't')
    expect(failing).toHaveBeenCalledTimes(2) // failures are retried after 10s
  })
})
