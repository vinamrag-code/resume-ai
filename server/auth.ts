import type { IncomingMessage, ServerResponse } from 'node:http'
import { authEnabled } from './config'
import type { ServerConfig } from './config'
import { verifyFirebaseIdToken } from './firebase'
import type { FirebaseUser } from './firebase'

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

type FetchLike = (url: string) => Promise<Response>

/** The signed-in user for this request (Firebase ID token in `Authorization: Bearer ...`), or null. */
export async function getUser(req: IncomingMessage, cfg: ServerConfig, fetchImpl?: FetchLike): Promise<FirebaseUser | null> {
  if (!authEnabled(cfg)) return null
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token || token.length > 4000) return null
  try {
    return await verifyFirebaseIdToken(token, cfg.firebase.projectId, fetchImpl)
  } catch {
    return null
  }
}

/** GET /api/auth/config -> { required, firebase } so the page can start Firebase without a rebuild. */
export function createAuthHandler(cfg: ServerConfig) {
  const enabled = authEnabled(cfg)
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url ?? '/', 'http://local').pathname
    if (!path.startsWith('/api/auth/')) return false
    if (path === '/api/auth/config' && req.method === 'GET') {
      json(res, 200, { required: enabled, firebase: enabled ? cfg.firebase : null })
      return true
    }
    json(res, 404, { error: { message: 'Not found.' } })
    return true
  }
}
