import { createPublicKey, verify } from 'node:crypto'
import type { SessionUser } from './session'

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

type FetchLike = (url: string) => Promise<Response>
type JwkInput = Extract<Parameters<typeof createPublicKey>[0], { format: 'jwk' }>['key']
type Jwk = JwkInput & { kid?: string }

let cache: { keys: Jwk[]; at: number } | null = null

async function getKeys(fetchImpl: FetchLike, now: number, force = false): Promise<Jwk[]> {
  if (!force && cache && now - cache.at < 3_600_000) return cache.keys
  const res = await fetchImpl(JWKS_URL)
  if (!res.ok) throw new Error('Could not load Google signing keys.')
  const keys = ((await res.json()) as { keys: Jwk[] }).keys
  cache = { keys, at: now }
  return keys
}

export function resetGoogleKeyCache(): void {
  cache = null
}

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>

/**
 * Verify a Google ID token (RS256 signature against Google's published keys, audience, issuer,
 * expiry, verified email). Returns the user, or throws an Error with a safe message.
 */
export async function verifyGoogleIdToken(credential: string, clientId: string, fetchImpl: FetchLike = fetch as FetchLike, now = Date.now()): Promise<SessionUser> {
  const parts = credential.split('.')
  if (parts.length !== 3) throw new Error('Malformed token.')
  const [h, p, s] = parts as [string, string, string]
  const header = decode(h)
  if (header.alg !== 'RS256') throw new Error('Unsupported token algorithm.')
  let keys = await getKeys(fetchImpl, now)
  let jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) {
    keys = await getKeys(fetchImpl, now, true) // keys may have rotated
    jwk = keys.find((k) => k.kid === header.kid)
  }
  if (!jwk) throw new Error('Unknown signing key.')
  const ok = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'))
  if (!ok) throw new Error('Invalid token signature.')
  const c = decode(p)
  if (c.aud !== clientId) throw new Error('Token was issued for a different app.')
  if (typeof c.iss !== 'string' || !ISSUERS.includes(c.iss)) throw new Error('Unexpected token issuer.')
  if (typeof c.exp !== 'number' || c.exp * 1000 < now) throw new Error('Token has expired.')
  if (typeof c.sub !== 'string' || !c.sub) throw new Error('Token has no subject.')
  if (c.email_verified !== true) throw new Error('Google account email is not verified.')
  return { sub: c.sub, email: String(c.email ?? ''), name: String(c.name ?? c.email ?? ''), picture: String(c.picture ?? '') }
}
