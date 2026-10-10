import { createPublicKey, verify } from 'node:crypto'

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

type FetchLike = (url: string) => Promise<Response>
type JwkInput = Extract<Parameters<typeof createPublicKey>[0], { format: 'jwk' }>['key']
type Jwk = JwkInput & { kid?: string }

export interface FirebaseUser {
  /** Firebase user id (stable). */
  uid: string
  email: string
  name: string
  picture: string
}

let cache: { keys: Jwk[]; at: number } | null = null

async function getKeys(fetchImpl: FetchLike, now: number, force = false): Promise<Jwk[]> {
  if (!force && cache && now - cache.at < 3_600_000) return cache.keys
  const res = await fetchImpl(JWKS_URL)
  if (!res.ok) throw new Error('Could not load Firebase signing keys.')
  const keys = ((await res.json()) as { keys: Jwk[] }).keys
  cache = { keys, at: now }
  return keys
}

export function resetKeyCache(): void {
  cache = null
}

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>

/**
 * Verify a Firebase Auth ID token without the Admin SDK: RS256 signature against Google's published
 * keys, audience = project id, issuer = securetoken for this project, expiry, and a subject.
 * Throws an Error with a safe message when invalid.
 */
export async function verifyFirebaseIdToken(token: string, projectId: string, fetchImpl: FetchLike = fetch as FetchLike, now = Date.now()): Promise<FirebaseUser> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed token.')
  const [h, p, s] = parts as [string, string, string]
  let header: Record<string, unknown>
  try {
    header = decode(h)
  } catch {
    throw new Error('Malformed token.')
  }
  if (header.alg !== 'RS256') throw new Error('Unsupported token algorithm.')
  let jwk = (await getKeys(fetchImpl, now)).find((k) => k.kid === header.kid)
  if (!jwk) jwk = (await getKeys(fetchImpl, now, true)).find((k) => k.kid === header.kid) // keys may have rotated
  if (!jwk) throw new Error('Unknown signing key.')
  if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'))) throw new Error('Invalid token signature.')
  let c: Record<string, unknown>
  try {
    c = decode(p)
  } catch {
    throw new Error('Malformed token.')
  }
  if (c.aud !== projectId) throw new Error('Token was issued for a different project.')
  if (c.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Unexpected token issuer.')
  if (typeof c.exp !== 'number' || c.exp * 1000 < now) throw new Error('Token has expired.')
  if (typeof c.iat === 'number' && c.iat * 1000 > now + 300_000) throw new Error('Token was issued in the future.')
  if (typeof c.sub !== 'string' || !c.sub || c.sub.length > 128) throw new Error('Token has no subject.')
  return { uid: c.sub, email: String(c.email ?? ''), name: String(c.name ?? c.email ?? ''), picture: String(c.picture ?? '') }
}
