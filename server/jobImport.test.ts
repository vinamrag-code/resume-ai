// @vitest-environment node
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from './config'
import { createJobImportHandler } from './jobImport'
import { detectWorkType, extractJob, htmlToText } from './jobExtract'
import { RateLimiter } from './rateLimit'
import { FetchError, checkUrl, fetchPage, isPrivateIp } from './safeFetch'
import type { PageResult } from './safeFetch'

const LONG = 'We are hiring a Frontend Engineer to build our product. You will work with React and TypeScript every day, ship features, and mentor teammates. '.repeat(3)

describe('extractJob', () => {
  it('reads schema.org JobPosting data (HTML description, nested location)', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Frontend Engineer',
      hiringOrganization: { '@type': 'Organization', name: 'Acme &amp; Co' },
      jobLocation: { address: { addressLocality: 'Pune', addressCountry: 'IN' } },
      description: `<p>${LONG}</p><ul><li>React</li><li>TypeScript</li></ul>`,
    })}</script></head><body>nav</body></html>`
    const job = extractJob(html)!
    expect(job).toMatchObject({ title: 'Frontend Engineer', company: 'Acme & Co', location: 'Pune, IN' })
    expect(job.description).toContain('- React')
    expect(job.description).not.toContain('<')
  })

  it('finds a JobPosting inside @graph and ignores broken JSON-LD blocks', () => {
    const html = `<script type="application/ld+json">{oops</script><script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'WebSite' }, { '@type': 'JobPosting', title: 'Data Analyst', description: LONG }] })}</script>`
    expect(extractJob(html)?.title).toBe('Data Analyst')
  })

  it('falls back to the readable page text and splits the title', () => {
    const html = `<html><head><title>Backend Developer at Globex | Careers</title></head><body><nav>Home Jobs</nav><main><h1>Backend Developer</h1><p>${LONG}</p><script>var x=1</script></main><footer>(c) Globex</footer></body></html>`
    const job = extractJob(html)!
    expect(job.title).toBe('Backend Developer')
    expect(job.company).toBe('Globex')
    expect(job.description).toContain('Frontend Engineer to build')
    expect(job.description).not.toMatch(/var x|Home Jobs|\(c\)/)
  })

  it('keeps only the posting on a LinkedIn-style page (no sign-in boxes or similar jobs)', () => {
    const html = `<html><head><title>DRUPAL INTERN at etelligens Technologies — Sadar, Uttar Pradesh, India | LinkedIn Jobs</title></head><body>
      <nav>Join or sign in to find your next job</nav>
      <section class="core-section-container my-3 description"><div class="description__text description__text--rich"><section class="show-more-less-html">
        <div class="show-more-less-html__markup show-more-less-html__markup--clamp-after-20
            relative overflow-hidden"><strong>Key Responsibilities<br><br></strong><ul><li>Assist in Drupal development and maintenance of our client websites using Drupal 9 and 10 every single day</li><li><div>nested</div> Fix bugs and test</li></ul><strong>Required Skills</strong><ul><li>PHP, HTML/CSS and JavaScript, plus a basic understanding of the Drupal content management system</li><li>Good debugging skills and eagerness to learn</li></ul></div>
        <button>Show more</button></section></div></section>
      <section>Sign in to tailor your resume</section><section>Similar jobs: Web Developer, Pineswift Technologies</section></body></html>`
    const job = extractJob(html)!
    expect(job).toMatchObject({ title: 'DRUPAL INTERN', company: 'etelligens Technologies', location: 'Sadar, Uttar Pradesh, India' })
    expect(job.description).toContain('- Assist in Drupal development')
    expect(job.description).toContain('Required Skills')
    expect(job.description).not.toMatch(/sign in|Similar jobs|Show more|Join/i)
  })

  it('reads a page without structured data from its own markup (Amazon.jobs style), not from a split page title', () => {
    const html = `<html><head><title>Systems Development Engineer Intern – 2027 - Job ID: 10498161 | Amazon.jobs</title>
      <meta property="og:title" content="Systems Development Engineer Intern – 2027"><meta property="og:site_name" content="Amazon.jobs"></head>
      <body><div class="jobs-navbar">Search jobs</div><div id="job-detail"><div class="apply-header"><h1 class="title">Systems Development Engineer Intern – 2027</h1><p class="meta">Job ID: 10498161 | ADCI HYD 13 SEZ</p></div>
      <div id="job-detail-body"><div class="content"><div class="section"><h2>Description</h2><p>${LONG}<br/><br/>Key job responsibilities</p></div><div class="section"><h2>Basic Qualifications</h2><p>- Are enrolled in a Bachelor's degree</p></div></div>
      <div class="sidebar"><h2>Job details</h2><div class="association location-icon"><ul class="association-content"><li>IND, KA, Bengaluru</li><li>IND, TS, Hyderabad</li></ul></div></div></div></div></body></html>`
    const job = extractJob(html)!
    expect(job).toMatchObject({ title: 'Systems Development Engineer Intern – 2027', company: 'Amazon', location: 'IND, KA, Bengaluru; IND, TS, Hyderabad' })
    expect(job.description).toContain('Basic Qualifications')
    expect(job.description).not.toMatch(/Job ID|Search jobs|Job details/)
  })

  it('returns null for pages with almost no text (login walls, JavaScript apps)', () => {
    expect(extractJob('<html><head><title>Sign in</title></head><body><div id="root"></div></body></html>')).toBeNull()
  })

  it('turns markup into clean text', () => {
    expect(htmlToText('<h2>About</h2><p>A &amp; B&nbsp;C</p><script>evil()</script><ul><li>One</li><li>Two</li></ul>')).toBe('About\n\nA & B C\n\n- One\n- Two')
  })
})

describe('work type', () => {
  it.each([
    ['Frontend Engineer (Remote)', '', 'remote'],
    ['Engineer', 'Hybrid - Pune', 'hybrid'],
    ['Engineer', 'On-site, Delhi', 'onsite'],
    ['Engineer', 'Pune, India', 'unspecified'],
  ])('headline %s / %s', (title, loc, expected) => {
    expect(detectWorkType(`${title} ${loc}`, '')).toBe(expected)
  })
  it('reads clear phrases in the description but ignores technical uses of the words', () => {
    expect(detectWorkType('', 'This is a hybrid work model, three days in the office.')).toBe('hybrid')
    expect(detectWorkType('', 'You can work from home most days.')).toBe('remote')
    expect(detectWorkType('', 'Candidates must be able to work on-site.')).toBe('onsite')
    expect(detectWorkType('', 'Experience with hybrid cloud and remote servers is a plus.')).toBe('unspecified')
  })
  it('uses the JobPosting remote flag and the page title', () => {
    const ld = (extra: object) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Engineer', description: LONG, ...extra })}</script>`
    expect(extractJob(ld({ jobLocationType: 'TELECOMMUTE' }))?.workType).toBe('remote')
    expect(extractJob(ld({}))?.workType).toBe('unspecified')
    expect(extractJob(`<title>Designer at Acme - Remote | Careers</title><main>${LONG}</main>`)?.workType).toBe('remote')
  })
})

describe('address safety', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', 'not-an-ip'])('blocks %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(true)
  })
  it.each(['8.8.8.8', '1.1.1.1', '151.101.1.1', '2606:4700:4700::1111'])('allows %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(false)
  })
  it.each(['ftp://example.com/x', 'file:///etc/passwd', 'http://localhost/x', 'http://127.0.0.1/x', 'http://[::1]/x', 'http://169.254.169.254/latest/meta-data', 'https://user:pw@example.com/', 'https://example.com:8080/', 'http://printer.local/', 'nonsense'])('rejects link %s', (u) => {
    expect(() => checkUrl(u)).toThrow(FetchError)
  })
  it('accepts a normal job link', () => {
    expect(checkUrl('https://boards.greenhouse.io/acme/jobs/1').hostname).toBe('boards.greenhouse.io')
  })
  it('never connects to localhost, even by name', async () => {
    await expect(fetchPage('http://localhost:80/')).rejects.toThrow(FetchError)
    await expect(fetchPage('http://127.0.0.1/')).rejects.toThrow(FetchError)
  })
})

describe('POST /api/job/import', () => {
  let close: (() => void) | null = null
  afterEach(() => close?.())
  const cfg = loadConfig({})
  const page = (over: Partial<PageResult> = {}): PageResult => ({ status: 200, url: 'https://x.test/', contentType: 'text/html; charset=utf-8', body: `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Engineer', description: LONG })}</script>`, ...over })

  async function start(getPage: (u: string) => Promise<PageResult>, limiter = new RateLimiter(10, 100)) {
    const handle = createJobImportHandler(cfg, { fetchPage: getPage, limiter })
    const server = createServer((req, res) => void handle(req, res).then((h) => !h && res.writeHead(404).end()))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    close = () => server.close()
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    return (body: unknown, init: RequestInit = {}) => fetch(`${base}/api/job/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...init })
  }

  it('returns the extracted job', async () => {
    const post = await start(async () => page())
    const r = await post({ url: 'https://x.test/job/1' })
    expect(r.status).toBe(200)
    expect(((await r.json()) as { job: { title: string } }).job.title).toBe('Engineer')
  })

  it('asks for a link, and only accepts POST from the same origin', async () => {
    const get = vi.fn(async () => page())
    const post = await start(get)
    expect((await post({})).status).toBe(400)
    expect((await post({ url: 5 })).status).toBe(400)
    expect((await post({ url: 'https://x.test' }, { headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' } })).status).toBe(403)
    expect(get).not.toHaveBeenCalled()
  })

  it('explains blocked, missing and unreadable pages', async () => {
    const cases: [Partial<PageResult>, RegExp][] = [
      [{ status: 403 }, /does not allow automatic access/],
      [{ status: 999 }, /does not allow automatic access/],
      [{ status: 404 }, /not found/],
      [{ status: 500 }, /error \(500\)/],
      [{ contentType: 'application/pdf' }, /not a web page/],
      [{ body: '<html><body><div id="root"></div></body></html>' }, /paste the description/],
    ]
    for (const [over, msg] of cases) {
      const post = await start(async () => page(over))
      const r = await post({ url: 'https://x.test/' })
      expect(r.status).toBe(422)
      expect(((await r.json()) as { error: { message: string } }).error.message).toMatch(msg)
      close?.()
    }
  })

  it('passes address-safety errors through and rate limits', async () => {
    const post = await start(async () => {
      throw new FetchError(400, 'That address is not allowed.')
    }, new RateLimiter(1, 5))
    const first = await post({ url: 'http://127.0.0.1/' })
    expect(first.status).toBe(400)
    expect(((await first.json()) as { error: { message: string } }).error.message).toBe('That address is not allowed.')
    expect((await post({ url: 'http://127.0.0.1/' })).status).toBe(429)
  })
})
