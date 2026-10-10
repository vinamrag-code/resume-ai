import type { IncomingMessage, ServerResponse } from 'node:http'
import { authEnabled } from './config'
import type { ServerConfig } from './config'
import { verifyGoogleIdToken } from './google'
import { clearSessionCookie, createSessionToken, getSession, setSessionCookie } from './session'
import type { SessionUser } from './session'
import { RateLimiter } from './rateLimit'
import { clientIp } from './proxy'

export function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}

/** Same-origin only, so other websites cannot make a signed-in browser act on this server. */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

export async function readJson(req: IncomingMessage, max: number): Promise<{ ok: true; value: unknown } | { ok: false; status: number; message: string }> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > max) return { ok: false, status: 413, message: 'Request is too large.' }
    chunks.push(chunk as Buffer)
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    return { ok: false, status: 400, message: 'Body must be valid JSON.' }
  }
}

type FetchLike = (url: string) => Promise<Response>

/**
 *   GET  /api/auth/config  -> { required, googleClientId }
 *   GET  /api/auth/me      -> { user } (null when signed out)
 *   POST /api/auth/google  -> { credential } verified with Google, sets the session cookie
 *   POST /api/auth/logout  -> clears the cookie
 */
export function createAuthHandler(cfg: ServerConfig, fetchImpl?: FetchLike) {
  const enabled = authEnabled(cfg)
  const loginLimiter = new RateLimiter(10, 100)
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url ?? '/', 'http://local').pathname
    if (!path.startsWith('/api/auth/')) return false
    if (!sameOrigin(req)) return json(res, 403, { error: { message: 'Cross-origin requests are not allowed.' } }), true

    if (path === '/api/auth/config' && req.method === 'GET') {
      json(res, 200, { required: enabled, googleClientId: enabled ? cfg.googleClientId : '' })
      return true
    }
    if (path === '/api/auth/me' && req.method === 'GET') {
      const user = enabled ? getSession(req, cfg) : null
      json(res, 200, { user: user && { email: user.email, name: user.name, picture: user.picture } })
      return true
    }
    if (path === '/api/auth/logout' && req.method === 'POST') {
      clearSessionCookie(req, res)
      json(res, 200, { ok: true })
      return true
    }
    if (path === '/api/auth/google' && req.method === 'POST') {
      if (!enabled) return json(res, 503, { error: { message: 'Sign-in is not configured on this server.' } }), true
      const limit = loginLimiter.check(clientIp(req, cfg.trustProxy))
      if (!limit.ok) return json(res, 429, { error: { message: 'Too many sign-in attempts. Please wait.' } }, { 'Retry-After': String(limit.retryAfter) }), true
      const body = await readJson(req, 20_000)
      if (!body.ok) return json(res, body.status, { error: { message: body.message } }), true
      const credential = (body.value as { credential?: unknown })?.credential
      if (typeof credential !== 'string' || !credential) return json(res, 400, { error: { message: 'Missing credential.' } }), true
      let user: SessionUser
      try {
        user = await verifyGoogleIdToken(credential, cfg.googleClientId, fetchImpl)
      } catch (e) {
        return json(res, 401, { error: { message: e instanceof Error ? e.message : 'Sign-in failed.' } }), true
      }
      setSessionCookie(req, res, createSessionToken(user, cfg), cfg)
      json(res, 200, { user: { email: user.email, name: user.name, picture: user.picture } })
      return true
    }
    json(res, 404, { error: { message: 'Not found.' } })
    return true
  }
}
