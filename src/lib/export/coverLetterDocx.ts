import { Document, Packer, Paragraph, TextRun } from 'docx'

/** Plain, parser-friendly DOCX: one paragraph per blank-line-separated block. */
export function buildLetterDocx(body: string, title = 'Cover letter'): Document {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  return new Document({
    creator: 'Resume AI',
    title,
    sections: [
      {
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children: blocks.map(
          (block) =>
            new Paragraph({
              spacing: { after: 240 },
              children: block.split('\n').flatMap((line, i) => [new TextRun({ text: line, font: 'Calibri', size: 22, break: i === 0 ? 0 : 1 })]),
            }),
        ),
      },
    ],
  })
}

export async function letterToDocxBlob(body: string, title?: string): Promise<Blob> {
  return Packer.toBlob(buildLetterDocx(body, title))
}
