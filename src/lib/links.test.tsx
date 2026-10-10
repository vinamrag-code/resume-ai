import JSZip from 'jszip'
import { Packer } from 'docx'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResumePreview } from '@/features/templates/ResumePreview'
import { newResume } from '@/lib/resume'
import { sampleContent } from '@/test/fixtures'
import { buildResumeDocx } from './export/docx'
import { displayUrl, normalizeUrl } from './links'

describe('normalizeUrl', () => {
  it('adds https to bare domains and paths, keeps full URLs, and links emails', () => {
    expect(normalizeUrl('linkedin.com/in/ada')).toBe('https://linkedin.com/in/ada')
    expect(normalizeUrl('github.com/ada')).toBe('https://github.com/ada')
    expect(normalizeUrl('https://ada.dev/')).toBe('https://ada.dev/')
    expect(normalizeUrl('ada@example.com')).toBe('mailto:ada@example.com')
  })
  it('rejects unsafe or unusable values', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('data:text/html,x')).toBeNull()
    expect(normalizeUrl('my portfolio')).toBeNull()
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl('nodots')).toBeNull()
  })
  it('shortens display text', () => {
    expect(displayUrl('https://www.github.com/ada/')).toBe('github.com/ada')
    expect(displayUrl('mailto:ada@example.com')).toBe('ada@example.com')
  })
})

function withLinks() {
  const content = sampleContent()
  content.contact.links = [
    { id: 'l1', label: 'LinkedIn', url: 'linkedin.com/in/ada' },
    { id: 'l2', label: 'GitHub', url: 'https://github.com/ada' },
    { id: 'l3', label: 'Bad', url: 'javascript:alert(1)' },
  ]
  content.projects[0]!.link = 'github.com/ada/engine-sim'
  return content
}

describe('hyperlinks in the resume preview (kept in PDF export)', () => {
  it('renders real anchors for links, email and project links', () => {
    render(<ResumePreview resume={newResume('x', withLinks())} />)
    const hrefOf = (name: RegExp) => screen.getByRole('link', { name }).getAttribute('href')
    expect(hrefOf(/linkedin\.com\/in\/ada/)).toBe('https://linkedin.com/in/ada')
    expect(hrefOf(/^github\.com\/ada$/)).toBe('https://github.com/ada')
    expect(hrefOf(/ada@example\.com/)).toBe('mailto:ada@example.com')
    expect(hrefOf(/engine-sim/)).toBe('https://github.com/ada/engine-sim')
    expect(screen.getByText(/LinkedIn:/)).toBeInTheDocument()
  })
  it('never makes an unsafe URL clickable', () => {
    render(<ResumePreview resume={newResume('x', withLinks())} />)
    expect(screen.getAllByRole('link').every((a) => !/^javascript:/i.test(a.getAttribute('href') ?? ''))).toBe(true)
    expect(screen.getByText(/javascript:alert\(1\)/)).toBeInTheDocument()
  })
})

describe('hyperlinks in the DOCX export', () => {
  it('writes external hyperlink relationships', async () => {
    const buf = await Packer.toBuffer(buildResumeDocx(withLinks(), { fontSize: 10.5, spacing: 1 }, 'classic'))
    const zip = await JSZip.loadAsync(buf)
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    for (const target of ['https://linkedin.com/in/ada', 'https://github.com/ada', 'mailto:ada@example.com', 'https://github.com/ada/engine-sim']) {
      expect(rels).toContain(target)
    }
    expect(rels).not.toContain('javascript:')
    expect(rels.match(/TargetMode="External"/g)!.length).toBeGreaterThanOrEqual(4)
  })
})
