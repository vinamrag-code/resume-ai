import type { IncomingMessage, ServerResponse } from 'node:http'
import { SyncDocSchema } from '../src/lib/sync/schema'
import { json, readJson, sameOrigin } from './auth'
import { authEnabled } from './config'
import type { ServerConfig } from './config'
import { RateLimiter } from './rateLimit'
import { getSession } from './session'
import type { SyncStore } from './store'

/**
 *   GET    /api/sync -> { rev, data } (data is null if nothing is stored yet)
 *   PUT    /api/sync -> { baseRev, data }; 200 { rev } or 409 { rev, data } if the cloud copy changed since baseRev
 *   DELETE /api/sync -> deletes the account's cloud data
 */
export function createSyncHandler(cfg: ServerConfig, store: SyncStore) {
  const enabled = authEnabled(cfg)
  const writes = new RateLimiter(60, 2000)
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url ?? '/', 'http://local').pathname
    if (path !== '/api/sync') return false
    if (!sameOrigin(req)) return json(res, 403, { error: { message: 'Cross-origin requests are not allowed.' } }), true
    if (!enabled) return json(res, 503, { error: { message: 'Cloud sync is not configured on this server.' } }), true
    const user = getSession(req, cfg)
    if (!user) return json(res, 401, { error: { message: 'Sign in to use cloud sync.' } }), true

    if (req.method === 'GET') {
      const stored = await store.get(user.sub)
      json(res, 200, { rev: stored?.rev ?? 0, data: stored?.data ?? null })
      return true
    }
    if (req.method === 'DELETE') {
      await store.delete(user.sub)
      json(res, 200, { ok: true })
      return true
    }
    if (req.method === 'PUT') {
      const limit = writes.check(user.sub)
      if (!limit.ok) return json(res, 429, { error: { message: 'Too many sync requests. Please wait.' } }, { 'Retry-After': String(limit.retryAfter) }), true
      const body = await readJson(req, cfg.maxSyncBytes)
      if (!body.ok) return json(res, body.status, { error: { message: body.message } }), true
      const { baseRev, data } = (body.value ?? {}) as { baseRev?: unknown; data?: unknown }
      const parsed = SyncDocSchema.safeParse(data)
      if (typeof baseRev !== 'number' || !Number.isInteger(baseRev) || baseRev < 0 || !parsed.success) {
        return json(res, 400, { error: { message: 'Invalid sync data.' } }), true
      }
      const result = await store.put(user.sub, parsed.data, baseRev)
      if (result.ok) json(res, 200, { rev: result.rev })
      else json(res, 409, { rev: result.current?.rev ?? 0, data: result.current?.data ?? null })
      return true
    }
    json(res, 405, { error: { message: 'Method not allowed.' } }, { Allow: 'GET, PUT, DELETE' })
    return true
  }
}
