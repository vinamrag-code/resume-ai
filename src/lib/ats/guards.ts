import { stem, tokenize } from './keywords'

const COMMON_CAPS = new Set(['i', 'a', 'the', 'and', 'of', 'in', 'to', 'for', 'with'])

/**
 * Terms in `after` that look like names, tools or technologies (Capitalised mid-sentence, ALLCAPS,
 * or containing + # . digits) but appear nowhere in `source`. Used as a cheap, deterministic
 * check against invented employers, tools and skills.
 */
export function findNewTerms(after: string, source: string): string[] {
  const known = new Set(tokenize(source).map(stem))
  const words = after.split(/\s+/).map((w) => w.replace(/^[("'[]+|[)"'\],.;:!?]+$/g, ''))
  const out: string[] = []
  words.forEach((w, i) => {
    if (w.length < 2 || COMMON_CAPS.has(w.toLowerCase())) return
    const looksLikeName = (i > 0 && /^[A-Z][A-Za-z0-9]*/.test(w)) || /^[A-Z]{2,}$/.test(w) || /[+#]/.test(w) || /^[A-Za-z]+\.[A-Za-z]+$/.test(w)
    if (!looksLikeName || /^\d/.test(w)) return
    const parts = tokenize(w)
    if (parts.length && parts.every((p) => known.has(stem(p)))) return
    if (!out.includes(w)) out.push(w)
  })
  return out
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/

/** Cross-check parsed contact details against the source text: drop invented ones, fill missed ones. */
export function repairContact(source: string, contact: { email: string; phone: string }): { email: string; phone: string; notes: string[] } {
  const notes: string[] = []
  const digits = (s: string) => s.replace(/\D/g, '')
  let { email, phone } = contact
  if (email && !source.toLowerCase().includes(email.toLowerCase())) {
    notes.push(`Removed email "${email}" because it is not in the original text.`)
    email = ''
  }
  if (phone && !digits(source).includes(digits(phone))) {
    notes.push(`Removed phone "${phone}" because it is not in the original text.`)
    phone = ''
  }
  if (!email) email = source.match(EMAIL)?.[0] ?? ''
  if (!phone) phone = source.match(PHONE)?.[0]?.trim() ?? ''
  return { email, phone, notes }
}
