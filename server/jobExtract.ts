/** Pulls a job posting out of a web page's HTML (parsed with cheerio). Pure functions: no network, easy to test. */
import * as cheerio from 'cheerio'

export type WorkType = 'remote' | 'hybrid' | 'onsite' | 'unspecified'

export interface ImportedJob {
  title: string
  company: string
  location: string
  /** 'remote' | 'hybrid' | 'onsite' | 'unspecified' */
  workType: WorkType
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

/** A node of the parsed page (domhandler's type, which cheerio does not re-export). */
type AnyNode = Parameters<typeof cheerio.contains>[0]

const BLOCK = new Set(['p', 'div', 'section', 'article', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'header', 'footer', 'blockquote', 'dl', 'dt', 'dd', 'pre', 'main'])
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'button', 'select', 'option', 'textarea'])

/** Plain text of a DOM node: block tags become line breaks and list items become "- " lines. */
function nodeText(node: AnyNode, inItem = false): string {
  if (node.type === 'text') return node.data
  if (node.type !== 'tag' && node.type !== 'root') return ''
  if (node.type === 'tag') {
    const name = node.name.toLowerCase()
    if (SKIP.has(name)) return ''
    if (name === 'br') return '\n'
    if (name === 'li') return `\n- ${node.children.map((c) => nodeText(c, true)).join('')}`
    // Inside a list item a nested <div> or <p> must not split the bullet.
    if (BLOCK.has(name) && !inItem) return `\n${node.children.map((c) => nodeText(c, inItem)).join('')}\n`
  }
  return node.children.map((c) => nodeText(c, inItem)).join('')
}

function tidy(text: string): string {
  return text
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** HTML -> readable plain text. */
export function htmlToText(html: string): string {
  return tidy(nodeText(cheerio.load(html, null, false).root().get(0)!))
}

/**
 * Remote / hybrid / on-site. The title and location are trusted ("Engineer - Remote"); inside a long description only
 * phrases that are clearly about the work arrangement count, so "hybrid cloud" or "remote servers" do not.
 */
export function detectWorkType(headline: string, description: string): WorkType {
  const strong = (t: string): WorkType | null =>
    /\bhybrid\b/i.test(t) ? 'hybrid' : /\b(remote|work from home|wfh|telecommut\w*)\b/i.test(t) ? 'remote' : /\bon-?site\b|\bin[- ]office\b|\bwork from office\b/i.test(t) ? 'onsite' : null
  const fromHeadline = strong(headline)
  if (fromHeadline) return fromHeadline
  if (/\bhybrid\s+(work|working|model|role|position|mode|setup|schedule|arrangement|opportunity)\b|\b(role|position|job)\s+is\s+(a\s+)?hybrid\b|\(hybrid\)/i.test(description)) return 'hybrid'
  if (/\b(fully\s+|100%\s+)?remote\s+(work|working|role|position|job|opportunity|first)\b|\bwork(ing)?\s+(from\s+home|remotely)\b|\bwfh\b|\(remote\)|\bremote[- ]first\b|\b(role|position|job)\s+is\s+(a\s+)?(fully\s+)?remote\b/i.test(description)) return 'remote'
  if (/\bon-?site\b|\bwork from office\b|\bin-office\b|\bwork(ing)?\s+from\s+the\s+office\b/i.test(description)) return 'onsite'
  return 'unspecified'
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

type Page = cheerio.CheerioAPI

function fromJsonLd($: Page): ImportedJob | null {
  const found: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      findPostings(JSON.parse(decodeEntities($(el).text()).trim()), found)
    } catch {
      /* some sites ship invalid JSON-LD: ignore that block */
    }
  })
  const posting = found.find((p) => str(p.description))
  if (!posting) return null
  const org = posting.hiringOrganization
  const remote = String(posting.jobLocationType ?? '').toUpperCase() === 'TELECOMMUTE'
  const raw = str(posting.description)
  return {
    title: decodeEntities(str(posting.title)),
    company: decodeEntities(typeof org === 'object' && org ? str((org as Record<string, unknown>).name) : str(org)),
    location: decodeEntities(locationOf(posting.jobLocation)),
    workType: remote ? 'remote' : 'unspecified',
    // Descriptions are usually HTML, sometimes (double-)escaped HTML.
    description: htmlToText(decodeEntities(raw).includes('<') ? decodeEntities(raw) : raw),
  }
}

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

function meta($: Page, key: string): string {
  return clean($(`meta[property="${key}"], meta[name="${key}"]`).first().attr('content'))
}

/** First selector whose element has short, non-empty text. */
function firstText($: Page, selectors: string[], max = 200): string {
  for (const sel of selectors) {
    for (const el of $(sel).toArray()) {
      const t = clean($(el).text())
      if (t && t.length <= max) return t
    }
  }
  return ''
}

/** Words that are page furniture, not a company: "Careers", "Jobs", "Job ID: 123". */
const FURNITURE = /^(careers?|jobs?|job\s*(id|details?|search)\b.*|apply( now)?|home|linkedin( jobs)?|indeed|glassdoor)$/i

/** "Amazon.jobs" -> "Amazon", "Acme Careers" -> "Acme". */
function cleanSiteName(name: string): string {
  return name.replace(/\.(jobs|com|io|co|org|net)\b.*$/i, '').replace(/\s+(careers?|jobs?)$/i, '').trim()
}

/**
 * Split "Software Engineer at Acme — Pune, India | LinkedIn Jobs" or "Engineer | Acme" style page titles.
 * Dashes inside the title itself ("Intern – 2027") are left alone: only " | " and spaced hyphens separate parts.
 */
function splitTitle(raw: string): { title: string; company: string; location: string } {
  const t = clean(raw)
  const at = t.match(/^(.+?)\s+(?:at|@)\s+([^|\-–—]+?)(?:\s+[–—]\s+([^|]+?))?(?:\s+\||$)/i)
  if (at) return { title: at[1]!.trim(), company: at[2]!.trim(), location: (at[3] ?? '').trim() }
  const parts = t.split(/\s+\|\s+|\s-\s/).map((p) => p.trim()).filter((p) => p && !FURNITURE.test(p))
  return { title: parts[0] ?? '', company: parts.length > 1 ? (parts[parts.length - 1] ?? '') : '', location: '' }
}

/** Where well-known job sites and many applicant-tracking pages put the posting text itself, most specific first. */
const DESCRIPTION_SELECTORS = [
  '.show-more-less-html__markup', // LinkedIn
  '#jobDescriptionText', // Indeed
  '[class*="JobDetails_jobDescription"]', // Glassdoor
  '#job-detail-body .content', // Amazon.jobs
  '[itemprop="description"]',
  '#job-description, #job_description, #jobDescription',
  '[class*="job-description"], [class*="job_description"], [class*="jobDescription"], [class*="posting-description"], [class*="job-details__description"]',
  '[data-testid*="job-description"], [data-automation-id="jobPostingDescription"]',
]

const LOCATION_SELECTORS = [
  '[itemprop="jobLocation"]',
  '[data-testid*="location" i]',
  '[data-automation-id="locations"]',
  '[class*="job-location"], [class*="jobLocation"], [class*="posting-location"]',
  '[class*="topcard__flavor--bullet"]',
]

function descriptionContainer($: Page): string | null {
  for (const sel of DESCRIPTION_SELECTORS) {
    for (const el of $(sel).toArray()) {
      const text = tidy(nodeText(el))
      if (text.length >= 120) return text
    }
  }
  return null
}

function pageLocation($: Page): string {
  // A list of places (Amazon lists one <li> per city) reads better joined than as one run-on string.
  const items = $('[class*="location"] li').toArray().map((el) => clean($(el).text())).filter((t) => t && t.length <= 80)
  if (items.length) return [...new Set(items)].slice(0, 5).join('; ')
  const city = $('[itemprop="addressLocality"]').first().text()
  return clean(city) || firstText($, LOCATION_SELECTORS, 120)
}

function fromPage($: Page): ImportedJob {
  const pageTitle = clean($('title').first().text())
  const rawTitle = meta($, 'og:title') || pageTitle
  const split = splitTitle(rawTitle)
  // The visible heading is the truest title; the page <title> is often "Title - Site - Job ID".
  const heading = firstText($, ['[itemprop="title"]', 'h1.title, h1[class*="title"], [class*="job-title"], [data-testid*="job-title"]', 'main h1', 'h1'], 160)
  const title = heading || split.title
  const site = cleanSiteName(meta($, 'og:site_name'))
  const company =
    firstText($, ['[itemprop="hiringOrganization"] [itemprop="name"]', '[itemprop="hiringOrganization"]', '[data-testid*="company" i]', '[class*="company-name"], [class*="companyName"]'], 80) ||
    (heading && split.company === split.title ? '' : split.company) ||
    site
  const known = descriptionContainer($)
  let description = known
  if (!description) {
    $('nav, header, footer, aside, form, [class*="breadcrumb"], [class*="cookie"]').remove()
    const main = $('main, article').toArray()[0] ?? $('body').toArray()[0] ?? $.root().get(0)!
    description = tidy(nodeText(main))
  }
  // Pages that render the posting with JavaScript often still put the whole text in the social-share description.
  if (description.length < 200) {
    const og = meta($, 'og:description')
    if (og.length > description.length) description = og
  }
  return { title, company, location: split.location || pageLocation($), workType: detectWorkType(rawTitle, ''), description }
}

/** Best effort: structured data (JobPosting) first, otherwise the readable text of the page. */
export function extractJob(html: string): ImportedJob | null {
  const $ = cheerio.load(html)
  const structured = fromJsonLd($)
  const result = structured && structured.description.length >= 80 ? structured : fromPage($)
  const description = result.description.slice(0, MAX_DESCRIPTION).trim()
  // Pages that need JavaScript or a login (LinkedIn, Indeed...) come back nearly empty.
  if (description.length < 200 && !structured) return null
  const workType = result.workType !== 'unspecified' ? result.workType : detectWorkType(`${result.title} ${result.location}`, description)
  return { ...result, title: result.title || structured?.title || '', workType, description }
}
