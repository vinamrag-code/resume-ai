/** Pulls a job posting out of a web page's HTML. Pure functions: no network, easy to test. */

export interface ImportedJob {
  title: string
  company: string
  location: string
  description: string
}

const MAX_DESCRIPTION = 20_000

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', bull: '-' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' '
    }
    return NAMED[e.toLowerCase()] ?? m
  })
}

/** HTML -> readable plain text: block tags become line breaks and list items become "- " lines. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|ul|ol|h[1-6]|tr|table|header|footer)\s*>/gi, '\n')
    .replace(/<(p|div|section|article|h[1-6]|tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
  return decodeEntities(text)
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function findPostings(node: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 6) return
  if (Array.isArray(node)) {
    for (const n of node) findPostings(n, out, depth + 1)
    return
  }
  const obj = node as Record<string, unknown>
  const type = obj['@type']
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) out.push(obj)
  if (obj['@graph']) findPostings(obj['@graph'], out, depth + 1)
}

function locationOf(v: unknown): string {
  const first = Array.isArray(v) ? v[0] : v
  if (!first || typeof first !== 'object') return str(first)
  const addr = (first as Record<string, unknown>).address
  if (addr && typeof addr === 'object') {
    const a = addr as Record<string, unknown>
    return [str(a.addressLocality), str(a.addressRegion), str(a.addressCountry)].filter(Boolean).join(', ')
  }
  return str(addr)
}

function fromJsonLd(html: string): ImportedJob | null {
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi
  const found: Record<string, unknown>[] = []
  for (const m of html.matchAll(re)) {
    try {
      findPostings(JSON.parse(decodeEntities(m[1] ?? '').trim()), found)
    } catch {
      /* some sites ship invalid JSON-LD: ignore that block */
    }
  }
  const posting = found.find((p) => str(p.description))
  if (!posting) return null
  const org = posting.hiringOrganization
  return {
    title: decodeEntities(str(posting.title)),
    company: decodeEntities(typeof org === 'object' && org ? str((org as Record<string, unknown>).name) : str(org)),
    location: decodeEntities(locationOf(posting.jobLocation)),
    // Descriptions are usually HTML, sometimes (double-)escaped HTML.
    description: htmlToText(decodeEntities(str(posting.description)).includes('<') ? decodeEntities(str(posting.description)) : str(posting.description)),
  }
}

function meta(html: string, key: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    if (new RegExp(`(?:property|name)\\s*=\\s*["']${key}["']`, 'i').test(tag)) {
      const c = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
      if (c) return decodeEntities((c[1] ?? c[2] ?? '').trim())
    }
  }
  return ''
}

/** Split "Software Engineer - Acme" / "Software Engineer at Acme — Pune, India | LinkedIn Jobs" style page titles. */
function splitTitle(raw: string): { title: string; company: string; location: string } {
  const t = raw.replace(/\s+/g, ' ').trim()
  const at = t.match(/^(.+?)\s+(?:at|@)\s+([^|\-–—]+?)(?:\s+[–—]\s+([^|]+?))?(?:\s+\||$)/i)
  if (at) return { title: at[1]!.trim(), company: at[2]!.trim(), location: (at[3] ?? '').trim() }
  const parts = t.split(/\s+[|\-–—]\s+/).map((p) => p.trim()).filter(Boolean)
  return { title: parts[0] ?? '', company: parts.length > 1 ? (parts[parts.length - 1] ?? '') : '', location: '' }
}

/** Where well-known job sites and many applicant-tracking pages put the posting text itself. */
const DESCRIPTION_MARKERS = [
  /class\s*=\s*["'][^"']*show-more-less-html__markup/i, // LinkedIn
  /id\s*=\s*["']jobDescriptionText["']/i, // Indeed
  /class\s*=\s*["'][^"']*jobsearch-JobComponent-description/i,
  /class\s*=\s*["'][^"']*JobDetails_jobDescription/i, // Glassdoor
  /itemprop\s*=\s*["']description["']/i,
  /id\s*=\s*["'](?:job-?description|job_description|jobDescription|content)["']/i,
  /class\s*=\s*["'][^"']*(?:job-?description|job_description|jobDescription|posting-description|job-details__description)[^"']*["']/i,
]

/** Inner HTML of the first element whose opening tag matches `marker`, balancing nested tags of the same name. */
function elementInner(html: string, marker: RegExp): string | null {
  for (const open of html.matchAll(/<(div|section|article|span|td|main)\b[^>]*>/gi)) {
    if (!marker.test(open[0])) continue
    const tag = open[1]!.toLowerCase()
    const start = (open.index ?? 0) + open[0].length
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
    re.lastIndex = start
    let depth = 1
    for (let m = re.exec(html); m; m = re.exec(html)) {
      depth += m[1] ? -1 : 1
      if (depth === 0) return html.slice(start, m.index)
    }
    return html.slice(start)
  }
  return null
}

function descriptionContainer(html: string): string | null {
  for (const marker of DESCRIPTION_MARKERS) {
    const inner = elementInner(html, marker)
    if (inner && htmlToText(inner).length >= 120) return htmlToText(inner)
  }
  return null
}

function fromPage(html: string): ImportedJob {
  const pageTitle = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim())
  const { title, company, location } = splitTitle(meta(html, 'og:title') || pageTitle)
  const known = descriptionContainer(html)
  const body = html.match(/<(main|article)\b[\s\S]*<\/\1\s*>/i)?.[0] ?? html.match(/<body\b[\s\S]*<\/body\s*>/i)?.[0] ?? html
  const cleaned = body.replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1\s*>/gi, ' ')
  return { title, company: meta(html, 'og:site_name') && !company ? meta(html, 'og:site_name') : company, location, description: known ?? htmlToText(cleaned) }
}

/** Best effort: structured data (JobPosting) first, otherwise the readable text of the page. */
export function extractJob(html: string): ImportedJob | null {
  const structured = fromJsonLd(html)
  const result = structured && structured.description.length >= 80 ? structured : fromPage(html)
  const description = result.description.slice(0, MAX_DESCRIPTION).trim()
  // Pages that need JavaScript or a login (LinkedIn, Indeed...) come back nearly empty.
  if (description.length < 200 && !structured) return null
  return { ...result, title: result.title || structured?.title || '', description }
}
