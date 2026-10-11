import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { authEnabled, loadConfig } from './config'
import { createApiHandler } from './api'

try {
  process.loadEnvFile?.('.env')
} catch {
  /* no .env file: use real environment variables */
}

const cfg = loadConfig()
const handleApi = createApiHandler(cfg)
const root = resolve(cfg.staticDir)

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json',
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  // Tiny response for uptime pings / cron jobs (the home page is a few hundred KB).
  if ((req.url ?? '').split('?')[0] === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('ok')
    return
  }
  if (await handleApi(req, res)) return
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'))
  let file = join(root, path)
  if (!file.startsWith(root)) {
    res.writeHead(403).end()
    return
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html') // SPA fallback
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not built yet. Run: npm run build')
    return
  }
  const immutable = file.includes(`${join(root, 'assets')}`)
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' })
  res.end(readFileSync(file))
})

server.listen(cfg.port, () => {
  const on = (['groq', 'openrouter'] as const).filter((p) => cfg.keys[p])
  console.log(`Resume AI server on http://localhost:${cfg.port}  (AI providers: ${on.join(', ') || 'none configured'}; sign-in: ${authEnabled(cfg) ? 'on' : 'off'})`)
})
