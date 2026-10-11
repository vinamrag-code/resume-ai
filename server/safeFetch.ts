import { lookup as dnsLookup } from 'node:dns'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'

/** An error that is safe to show the user as-is. */
export class FetchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const blocked = new BlockList()
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) {
  blocked.addSubnet(net, bits, 'ipv4')
}
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32]] as const) {
  blocked.addSubnet(net, bits, 'ipv6')
}

/** True for loopback, private, link-local, multicast and other addresses a public web page must never point us at. */
export function isPrivateIp(ip: string): boolean {
  let addr = ip.replace(/^\[|\]$/g, '').toLowerCase()
  const family = isIP(addr)
  if (!family) return true
  if (family === 6) {
    // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1): judge by the IPv4 address inside.
    const dotted = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    const hex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (dotted) addr = dotted[1]!
    else if (hex) {
      const n = (parseInt(hex[1]!, 16) << 16) | parseInt(hex[2]!, 16)
      addr = [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
    }
  }
  return blocked.check(addr, isIP(addr) === 4 ? 'ipv4' : 'ipv6')
}

/** Parse and vet a user supplied link. Throws FetchError when it is not a plain public web address. */
export function checkUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new FetchError(400, 'That does not look like a valid link.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError(400, 'Only http and https links are supported.')
  if (url.username || url.password) throw new FetchError(400, 'Links with a username or password are not supported.')
  if (url.port && url.port !== '80' && url.port !== '443') throw new FetchError(400, 'That address is not allowed.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new FetchError(400, 'That address is not allowed.')
  if (isIP(host) && isPrivateIp(host)) throw new FetchError(400, 'That address is not allowed.')
  return url
}

type LookupCb = (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void

/** DNS lookup that refuses private results. Connecting to the address it returns closes the DNS-rebinding gap. */
function safeLookup(hostname: string, options: { all?: boolean }, cb: LookupCb): void {
  dnsLookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err, '', 4)
    const list = addrs.filter((a) => !isPrivateIp(a.address))
    if (!list.length || list.length !== addrs.length) return cb(new FetchError(400, 'That address is not allowed.'), '', 4)
    if (options.all) return cb(null, list)
    cb(null, list[0]!.address, list[0]!.family)
  })
}

export interface PageResult {
  status: number
  url: string
  contentType: string
  body: string
}

export interface PageOptions {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
}

function once(url: URL, timeoutMs: number, maxBytes: number): Promise<{ status: number; location: string; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = send(
      {
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        lookup: safeLookup as never,
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ResumeAI-JobImport/1.0)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en',
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase()
        const stream = enc.includes('gzip') ? res.pipe(createGunzip()) : enc.includes('br') ? res.pipe(createBrotliDecompress()) : enc.includes('deflate') ? res.pipe(createInflate()) : res
        const finish = () => resolve({ status: res.statusCode ?? 0, location: String(res.headers.location ?? ''), contentType: String(res.headers['content-type'] ?? ''), body: Buffer.concat(chunks) })
        stream.on('data', (c: Buffer) => {
          size += c.length
          chunks.push(c)
          // A page bigger than the cap is cut off, not rejected: the job text is almost always near the top.
          if (size >= maxBytes) {
            req.destroy()
            finish()
          }
        })
        stream.on('end', finish)
        stream.on('error', () => reject(new FetchError(502, 'Could not read that page.')))
      },
    )
    req.on('timeout', () => req.destroy(new FetchError(504, 'That page took too long to respond.')))
    req.on('error', (e) => reject(e instanceof FetchError ? e : new FetchError(502, 'Could not open that page.')))
    req.end()
  })
}

/** GET a public web page: validated address, pinned DNS, manual redirects (each re-checked), size and time limits. */
export async function fetchPage(rawUrl: string, opts: PageOptions = {}): Promise<PageResult> {
  const { timeoutMs = 10_000, maxBytes = 1_500_000, maxRedirects = 4 } = opts
  let url = checkUrl(rawUrl)
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const r = await once(url, timeoutMs, maxBytes)
    if (r.status >= 300 && r.status < 400 && r.location) {
      try {
        url = checkUrl(new URL(r.location, url).toString())
      } catch (e) {
        throw e instanceof FetchError ? e : new FetchError(502, 'That page redirected somewhere invalid.')
      }
      continue
    }
    return { status: r.status, url: url.toString(), contentType: r.contentType, body: r.body.toString('utf8') }
  }
  throw new FetchError(502, 'That page redirected too many times.')
}
