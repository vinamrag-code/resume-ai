import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ServerConfig } from './config'

export interface SessionUser {
  /** Google account id (stable). */
  sub: string
  email: string
  name: string
  picture: string
}

interface Payload extends SessionUser {
  exp: number
}

export const COOKIE = 'ra_session'

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url')
const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest('base64url')

export function createSessionToken(user: SessionUser, cfg: Pick<ServerConfig, 'sessionSecret' | 'sessionDays'>, now = Date.now()): string {
  const body = b64(JSON.stringify({ ...user, exp: now + cfg.sessionDays * 86_400_000 } satisfies Payload))
  return `${body}.${sign(body, cfg.sessionSecret)}`
}

export function verifySessionToken(token: string, cfg: Pick<ServerConfig, 'sessionSecret'>, now = Date.now()): SessionUser | null {
  const [body, sig] = token.split('.')
  if (!body || !sig || !cfg.sessionSecret) return null
  const expected = Buffer.from(sign(body, cfg.sessionSecret))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<Payload>
    if (typeof p.sub !== 'string' || !p.sub || typeof p.exp !== 'number' || p.exp < now) return null
    return { sub: p.sub, email: String(p.email ?? ''), name: String(p.name ?? ''), picture: String(p.picture ?? '') }
  } catch {
    return null
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

/** The signed-in user for this request, or null. */
export function getSession(req: IncomingMessage, cfg: Pick<ServerConfig, 'sessionSecret'>): SessionUser | null {
  const token = parseCookies(req.headers.cookie)[COOKIE]
  return token ? verifySessionToken(token, cfg) : null
}

const isHttps = (req: IncomingMessage) => req.headers['x-forwarded-proto'] === 'https' || (req.socket as { encrypted?: boolean }).encrypted === true

export function setSessionCookie(req: IncomingMessage, res: ServerResponse, token: string, cfg: Pick<ServerConfig, 'sessionDays'>): void {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${cfg.sessionDays * 86400}${isHttps(req) ? '; Secure' : ''}`)
}

export function clearSessionCookie(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? '; Secure' : ''}`)
}
