/** Split a model reply ("Subject: ...", blank line, body) into subject and body. */
export function splitEmail(raw: string): { subject: string; body: string } {
  const m = raw.match(/^\s*subject:[ \t]*(.*)\n?/i)
  if (!m) return { subject: '', body: raw.trim() }
  return { subject: (m[1] ?? '').trim(), body: raw.slice(m[0].length).trim() }
}

interface Draft {
  to: string
  subject: string
  body: string
}

/** Opens the user's default email app. Browsers cannot attach files through a link, so attachments are added by hand. */
export function mailtoUrl({ to, subject, body }: Draft): string {
  const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?${q}`
}

export function gmailUrl({ to, subject, body }: Draft): string {
  const q = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body })
  return `https://mail.google.com/mail/?${q.toString()}`
}
