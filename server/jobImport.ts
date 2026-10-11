import type { IncomingMessage, ServerResponse } from 'node:http'
import { authEnabled } from './config'
import type { ServerConfig } from './config'
import { getUser, json, sameOrigin } from './auth'
import { extractJob } from './jobExtract'
import { clientIp } from './proxy'
import { RateLimiter } from './rateLimit'
import { FetchError, fetchPage } from './safeFetch'
import type { PageResult } from './safeFetch'

interface Deps {
  verifyFetch?: (url: string) => Promise<Response>
  /** Replaceable in tests so they never touch the network. */
  fetchPage?: (url: string) => Promise<PageResult>
  limiter?: RateLimiter
}

const fail = (res: ServerResponse, status: number, message: string, headers?: Record<string, string>) => json(res, status, { error: { message } }, headers)

const BLOCKED_HINT = 'That site does not allow automatic access (common for LinkedIn, Indeed and Glassdoor). Open the job in your browser and paste the description instead.'

async function readJson(req: IncomingMessage, max: number): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > max) return null
    chunks.push(c as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

/**
 * POST /api/job/import  { url } -> { job: { title, company, location, description } }
 * Same sign-in and per-user rate limiting as the AI proxy; the page is fetched by the server (never the browser).
 */
export function createJobImportHandler(cfg: ServerConfig, deps: Deps = {}) {
  const requireAuth = authEnabled(cfg)
  const limiter = deps.limiter ?? new RateLimiter(10, 100)
  const get = deps.fetchPage ?? ((u: string) => fetchPage(u))
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url ?? '/', 'http://local').pathname
    if (path !== '/api/job/import') return false
    if (!sameOrigin(req)) return fail(res, 403, 'Cross-origin requests are not allowed.'), true
    if (req.method !== 'POST') return fail(res, 405, 'Use POST.', { Allow: 'POST' }), true
    const user = requireAuth ? await getUser(req, cfg, deps.verifyFetch) : null
    if (requireAuth && !user) return fail(res, 401, 'Sign in to import a job from a link.'), true
    const limit = limiter.check(user ? user.uid : clientIp(req, cfg.trustProxy))
    if (!limit.ok) return fail(res, 429, 'Too many imports. Please wait a moment.', { 'Retry-After': String(limit.retryAfter) }), true
    const body = (await readJson(req, 4_000)) as { url?: unknown } | null
    if (!body || typeof body.url !== 'string' || body.url.length > 2_000) return fail(res, 400, 'Send a job link as { "url": "https://..." }.'), true
    try {
      const page = await get(body.url)
      if ([401, 403, 429, 999].includes(page.status)) return fail(res, 422, BLOCKED_HINT), true
      if (page.status === 404 || page.status === 410) return fail(res, 422, 'That page was not found. The job may have been taken down.'), true
      if (page.status >= 400) return fail(res, 422, `That site answered with an error (${page.status}).`), true
      if (page.contentType && !/html|xml|text\/plain/i.test(page.contentType)) return fail(res, 422, 'That link is not a web page.'), true
      const job = extractJob(page.body)
      if (!job) return fail(res, 422, `Could not find a job description on that page. Pages that need JavaScript or a login cannot be read automatically; paste the description instead.`), true
      json(res, 200, { job })
    } catch (e) {
      fail(res, e instanceof FetchError ? e.status : 502, e instanceof FetchError ? e.message : 'Could not open that page.')
    }
    return true
  }
}
