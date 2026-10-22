import { describe, expect, it } from 'vitest'
import { gmailUrl, mailtoUrl, splitEmail } from './mail'

describe('splitEmail', () => {
  it('separates the subject line from the body', () => {
    expect(splitEmail('Subject: Hello there\n\nHi Sam,\n\nThanks.')).toEqual({ subject: 'Hello there', body: 'Hi Sam,\n\nThanks.' })
  })
  it('treats a reply without a subject as all body', () => {
    expect(splitEmail('Hi Sam')).toEqual({ subject: '', body: 'Hi Sam' })
  })
})

describe('mail links', () => {
  const d = { to: 'a@b.com', subject: 'Hi & bye', body: 'Line 1\nLine 2' }
  it('encodes a mailto link', () => {
    expect(mailtoUrl(d)).toBe('mailto:a@b.com?subject=Hi%20%26%20bye&body=Line%201%0ALine%202')
  })
  it('builds a Gmail compose link', () => {
    const u = new URL(gmailUrl(d))
    expect(u.searchParams.get('to')).toBe('a@b.com')
    expect(u.searchParams.get('su')).toBe('Hi & bye')
    expect(u.searchParams.get('body')).toBe('Line 1\nLine 2')
  })
})
