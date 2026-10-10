import type { ServerConfig } from './config'

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/**
 * Is this signed-in user an admin? An admin has a document at admins/{uid}. The server reads it with the
 * user's own ID token, so the Firestore rules (which only let users read their own admin document) decide.
 * Fails closed: any error means "not an admin". Results are cached briefly.
 */
export function createAdminCheck(cfg: ServerConfig, fetchImpl: FetchLike = fetch as FetchLike, now: () => number = Date.now) {
  const cache = new Map<string, { at: number; admin: boolean; ttl: number }>()
  const { projectId } = cfg.firebase
  return async function isAdmin(uid: string, idToken: string): Promise<boolean> {
    if (!projectId) return false
    const hit = cache.get(uid)
    if (hit && now() - hit.at < hit.ttl) return hit.admin
    let admin = false
    let ttl = 60_000
    try {
      const res = await fetchImpl(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/admins/${encodeURIComponent(uid)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      admin = res.status === 200
      if (res.status !== 200 && res.status !== 404 && res.status !== 403) ttl = 10_000 // unexpected: retry soon
    } catch {
      ttl = 10_000
    }
    cache.set(uid, { at: now(), admin, ttl })
    if (cache.size > 5000) cache.delete(cache.keys().next().value as string)
    return admin
  }
}
