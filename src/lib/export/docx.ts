import { AlignmentType, Document, LevelFormat, Packer, Paragraph, TabStopPosition, TabStopType, TextRun } from 'docx'
import type { ResumeContent, ResumeStyle, TemplateId } from '@/types/resume'

const FONTS: Record<TemplateId, string> = { classic: 'Times New Roman', modern: 'Arial', compact: 'Calibri' }

const dates = (a: string, b: string) => [a, b].filter(Boolean).join(' - ')

/** Build a single-column, ATS-friendly DOCX that mirrors the on-screen template. */
export function buildResumeDocx(content: ResumeContent, style: ResumeStyle, templateId: TemplateId): Document {
  const font = FONTS[templateId]
  const size = Math.round(style.fontSize * 2)
  const gap = Math.round(60 * style.spacing)
  const centered = templateId === 'classic'
  const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; allCaps?: boolean } = {}) =>
    new TextRun({ text, font, size: o.size ?? size, bold: o.bold, italics: o.italics, allCaps: o.allCaps })

  const heading = (text: string) =>
    new Paragraph({
      spacing: { before: Math.round(220 * style.spacing), after: gap },
      border: { bottom: { style: 'single', size: 6, color: '111111', space: 1 } },
      children: [run(text, { bold: true, allCaps: true, size: size + 2 })],
    })
  const rowLine = (left: string, right: string) =>
    new Paragraph({
      spacing: { before: gap },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [run(left, { bold: true }), ...(right ? [new TextRun({ text: `\t${right}`, font, size })] : [])],
    })
  const text = (t: string, o: { italics?: boolean } = {}) => new Paragraph({ spacing: { after: gap }, children: [run(t, o)] })
  const bullets = (items: string[]) =>
    items
      .filter((b) => b.trim())
      .map((b) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: Math.round(gap / 2) }, children: [run(b)] }))

  const c = content
  const body: Paragraph[] = []
  const align = centered ? AlignmentType.CENTER : AlignmentType.LEFT
  body.push(new Paragraph({ alignment: align, children: [run(c.contact.name || 'Your Name', { bold: true, size: size * 2 })] }))
  const contact = [c.contact.email, c.contact.phone, c.contact.location].filter(Boolean).join(' | ')
  if (contact) body.push(new Paragraph({ alignment: align, children: [run(contact)] }))
  const links = c.contact.links.filter((l) => l.url).map((l) => (l.label ? `${l.label}: ${l.url}` : l.url)).join(' | ')
  if (links) body.push(new Paragraph({ alignment: align, children: [run(links)] }))

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
    for (const p of c.projects) body.push(rowLine(p.name, p.link), ...bullets(p.bullets))
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
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 220 } } } }],
        },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children: body }],
  })
}

export async function resumeToDocxBlob(content: ResumeContent, style: ResumeStyle, templateId: TemplateId): Promise<Blob> {
  return Packer.toBlob(buildResumeDocx(content, style, templateId))
}
