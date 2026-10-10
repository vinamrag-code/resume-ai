import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { authEnabled } from './config'
import type { Provider, ServerConfig } from './config'
import { getSession } from './session'
import { RateLimiter } from './rateLimit'

const UPSTREAM: Record<Provider, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}
const fail = (res: ServerResponse, status: number, message: string, headers?: Record<string, string>) => send(res, status, { error: { message } }, headers)

async function readBody(req: IncomingMessage, max: number): Promise<string | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > max) return null
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Validate the client's request and keep only fields we allow (no tools, no unknown options). */
export function sanitizeRequest(raw: unknown, provider: Provider, cfg: ServerConfig): { ok: true; body: Record<string, unknown> } | { ok: false; message: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, message: 'Body must be a JSON object.' }
  const r = raw as Record<string, unknown>
  if (typeof r.model !== 'string' || !cfg.allowedModels[provider].includes(r.model)) {
    return { ok: false, message: `Model is not allowed. Allowed: ${cfg.allowedModels[provider].join(', ')}` }
  }
  if (!Array.isArray(r.messages) || r.messages.length === 0 || r.messages.length > cfg.maxMessages) {
    return { ok: false, message: `messages must contain 1 to ${cfg.maxMessages} items.` }
  }
  let chars = 0
  const messages: Message[] = []
  for (const m of r.messages as unknown[]) {
    const mm = m as { role?: unknown; content?: unknown }
    if (!mm || !['system', 'user', 'assistant'].includes(mm.role as string) || typeof mm.content !== 'string') {
      return { ok: false, message: 'Each message needs a valid role and string content.' }
    }
    chars += mm.content.length
    messages.push({ role: mm.role as Message['role'], content: mm.content })
  }
  if (chars > cfg.maxChars) return { ok: false, message: `Prompt is too long (limit ${cfg.maxChars} characters).` }
  const body: Record<string, unknown> = { model: r.model, messages, stream: r.stream === true }
  if (typeof r.temperature === 'number') body.temperature = Math.min(2, Math.max(0, r.temperature))
  body.max_tokens = typeof r.max_tokens === 'number' ? Math.min(cfg.maxTokens, Math.max(1, Math.floor(r.max_tokens))) : cfg.maxTokens
  const rf = r.response_format as { type?: unknown } | undefined
  if (rf && rf.type === 'json_object') body.response_format = { type: 'json_object' }
  return { ok: true, body }
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for']
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
    if (first) return first
  }
  return req.socket.remoteAddress ?? 'unknown'
}

/** Same-origin only: a request from another website's page is rejected. (Direct curl calls are still rate limited.) */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

/**
 * Handles /api/llm/* requests. Returns true if the request was handled.
 *   GET  /api/llm/status                       -> which providers have a key on the server
 *   POST /api/llm/{groq|openrouter}/chat/completions -> validated, rate-limited, key-injected passthrough (streaming supported)
 */
export function createLlmHandler(cfg: ServerConfig, fetchImpl: FetchLike = fetch as FetchLike, limiter = new RateLimiter(cfg.perMinute, cfg.perDay), userLimiter = new RateLimiter(cfg.userPerMinute, cfg.userPerDay)) {
  const requireAuth = authEnabled(cfg)
  const timer = setInterval(() => {
    limiter.sweep()
    userLimiter.sweep()
  }, 10 * 60_000)
  timer.unref?.()
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://local')
    if (!url.pathname.startsWith('/api/llm')) return false

    if (!sameOrigin(req)) {
      fail(res, 403, 'Cross-origin requests are not allowed.')
      return true
    }
    if (url.pathname === '/api/llm/status' && req.method === 'GET') {
      send(res, 200, { providers: { groq: !!cfg.keys.groq, openrouter: !!cfg.keys.openrouter }, models: cfg.allowedModels })
      return true
    }
    const m = url.pathname.match(/^\/api\/llm\/(groq|openrouter)\/chat(?:\/completions)?$/)
    if (!m) {
      fail(res, 404, 'Not found.')
      return true
    }
    if (req.method !== 'POST') {
      fail(res, 405, 'Use POST.', { Allow: 'POST' })
      return true
    }
    const provider = m[1] as Provider
    const key = cfg.keys[provider]
    if (!key) {
      fail(res, 503, `${provider} is not configured on this server.`)
      return true
    }
    // When sign-in is configured, AI use requires it and limits are per account instead of per IP.
    const user = requireAuth ? getSession(req, cfg) : null
    if (requireAuth && !user) {
      fail(res, 401, 'Sign in with Google to use AI features.')
      return true
    }
    const limit = user ? userLimiter.check(user.sub) : limiter.check(clientIp(req, cfg.trustProxy))
    if (!limit.ok) {
      fail(res, 429, limit.reason === 'day' ? 'Daily request limit reached. Try again tomorrow.' : 'Too many requests. Please wait a moment.', { 'Retry-After': String(limit.retryAfter) })
      return true
    }
    const text = await readBody(req, cfg.maxBodyBytes)
    if (text === null) {
      fail(res, 413, 'Request is too large.')
      return true
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      fail(res, 400, 'Body must be valid JSON.')
      return true
    }
    const clean = sanitizeRequest(parsed, provider, cfg)
    if (!clean.ok) {
      fail(res, 400, clean.message)
      return true
    }

    const controller = new AbortController()
    res.on('close', () => controller.abort())
    let upstream: Response
    try {
      upstream = await fetchImpl(UPSTREAM[provider], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          ...(provider === 'openrouter' ? { 'HTTP-Referer': `http://${req.headers.host ?? 'localhost'}`, 'X-Title': 'Resume AI' } : {}),
        },
        body: JSON.stringify(clean.body),
        signal: controller.signal,
      })
    } catch {
      if (!res.writableEnded) fail(res, 502, `Could not reach ${provider}.`)
      return true
    }
    // Pass through status and body (streamed). Upstream error bodies are kept short and never include our key.
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
      ...(upstream.headers.get('retry-after') ? { 'Retry-After': upstream.headers.get('retry-after') as string } : {}),
    })
    if (!upstream.body) {
      res.end()
      return true
    }
    Readable.fromWeb(upstream.body as never).on('error', () => res.end()).pipe(res)
    return true
  }
}
