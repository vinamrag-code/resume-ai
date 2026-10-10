/** Turn what a user typed into a safe, clickable URL, or null if it is not a usable link. */
export function normalizeUrl(raw: string): string | null {
  const v = raw.trim()
  if (!v || /\s/.test(v)) return null
  if (/^(https?:|mailto:)/i.test(v)) return v
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v)) return `mailto:${v}`
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null // other schemes (javascript:, data:, ...) are never linked
  if (/^[^\s/]+\.[a-z]{2,}(?:[/?#:].*)?$/i.test(v)) return `https://${v}`
  return null
}

/** Short human-readable form of a URL for printing: no scheme, no www, no trailing slash. */
export function displayUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^(https?:\/\/|mailto:)/i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
}
