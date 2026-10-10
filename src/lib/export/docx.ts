import { AlignmentType, Document, ExternalHyperlink, LevelFormat, Packer, Paragraph, TabStopPosition, TabStopType, TextRun } from 'docx'
import { displayUrl, normalizeUrl } from '@/lib/links'
import type { ResumeContent, ResumeStyle, TemplateId } from '@/types/resume'

const FONTS: Record<TemplateId, string> = { classic: 'Times New Roman', modern: 'Arial', compact: 'Calibri' }

const dates = (a: string, b: string) => [a, b].filter(Boolean).join(' - ')

/** Build a single-column, ATS-friendly DOCX that mirrors the on-screen template. */
export function buildResumeDocx(content: ResumeContent, style: ResumeStyle, templateId: TemplateId): Document {
  const font = FONTS[templateId]
  const size = Math.round(style.fontSize * 2)
  const gap = Math.round(60 * style.spacing)
  const headerAlign = !style.headerAlign || style.headerAlign === 'auto' ? (templateId === 'classic' ? 'center' : 'left') : style.headerAlign
  const indentTwips = Math.round((style.bulletIndent ?? 1.1) * size * 10)
  const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; allCaps?: boolean } = {}) =>
    new TextRun({ text, font, size: o.size ?? size, bold: o.bold, italics: o.italics, allCaps: o.allCaps })

  const heading = (text: string) =>
    new Paragraph({
      spacing: { before: Math.round(220 * style.spacing), after: gap },
      border: { bottom: { style: 'single', size: 6, color: '111111', space: 1 } },
      children: [run(text, { bold: true, allCaps: true, size: size + 2 })],
    })
  /** Clickable link (blue, underlined). Plain text if the value is not a valid URL. */
  const linkRun = (raw: string) => {
    const url = normalizeUrl(raw)
    const text = displayUrl(raw)
    if (!url) return run(text)
    return new ExternalHyperlink({ link: url, children: [new TextRun({ text, font, size, color: '0563C1', underline: {} })] })
  }
  const rowLine = (left: string, right: string, rightIsLink = false) =>
    new Paragraph({
      spacing: { before: gap },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [run(left, { bold: true }), ...(right ? [new TextRun({ text: '\t', font, size }), rightIsLink ? linkRun(right) : new TextRun({ text: right, font, size })] : [])],
    })
  const text = (t: string, o: { italics?: boolean } = {}) => new Paragraph({ spacing: { after: gap }, children: [run(t, o)] })
  const bullets = (items: string[]) =>
    items
      .filter((b) => b.trim())
      .map((b) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: Math.round(gap / 2) }, children: [run(b)] }))

  const c = content
  const body: Paragraph[] = []
  const align = headerAlign === 'center' ? AlignmentType.CENTER : headerAlign === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT
  body.push(new Paragraph({ alignment: align, children: [run(c.contact.name || 'Your Name', { bold: true, size: size * 2 })] }))
  const contactParts = [c.contact.email && linkRun(c.contact.email), c.contact.phone && run(c.contact.phone), c.contact.location && run(c.contact.location)].filter((x) => !!x)
  if (contactParts.length) body.push(new Paragraph({ alignment: align, children: contactParts.flatMap((part, i) => (i ? [run(' | '), part] : [part])) }))
  const linkParts = c.contact.links.filter((l) => l.url).map((l) => [...(l.label ? [run(`${l.label}: `)] : []), linkRun(l.url)])
  if (linkParts.length) body.push(new Paragraph({ alignment: align, children: linkParts.flatMap((part, i) => (i ? [run(' | '), ...part] : part)) }))

  if (c.summary.trim()) body.push(heading('Summary'), text(c.summary))
  if (c.experience.length) {
    body.push(heading('Experience'))
    for (const e of c.experience) {
      body.push(rowLine([e.title, e.company].filter(Boolean).join(', '), dates(e.start, e.end)))
      if (e.location) body.push(text(e.location, { italics: true }))
      body.push(...bullets(e.bullets))
    }
  }
  if (c.projects.length) {
    body.push(heading('Projects'))
    for (const p of c.projects) body.push(rowLine(p.name, p.link, true), ...bullets(p.bullets))
  }
  if (c.education.length) {
    body.push(heading('Education'))
    for (const e of c.education) {
      body.push(rowLine([e.degree, e.field].filter(Boolean).join(', '), dates(e.start, e.end)), text(e.school), ...bullets(e.details))
    }
  }
  if (c.skills.length) body.push(heading('Skills'), text(c.skills.join(', ')))
  if (c.certifications.length) {
    body.push(heading('Certifications'))
    for (const x of c.certifications) body.push(rowLine([x.name, x.issuer].filter(Boolean).join(', '), x.date))
  }

  return new Document({
    creator: 'Resume AI',
    title: c.contact.name ? `${c.contact.name} - Resume` : 'Resume',
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: indentTwips, hanging: Math.min(indentTwips - 40, 220) } } } }],
        },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children: body }],
  })
}

export async function resumeToDocxBlob(content: ResumeContent, style: ResumeStyle, templateId: TemplateId): Promise<Blob> {
  return Packer.toBlob(buildResumeDocx(content, style, templateId))
}
