export interface PdfTextItem {
  str: string
  hasEOL?: boolean
}

/** Rebuild readable text from pdf.js text items (which only carry line-end hints). */
export function joinPdfItems(items: PdfTextItem[]): string {
  let out = ''
  for (const it of items) {
    out += it.str
    if (it.hasEOL) out += '\n'
    else if (it.str && !out.endsWith(' ')) out += ' '
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export class ExtractError extends Error {}

export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  } catch {
    throw new ExtractError('Could not read this PDF. It may be corrupted or password protected.')
  }
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const items = content.items.filter((x): x is typeof x & PdfTextItem => 'str' in x)
    pages.push(joinPdfItems(items))
  }
  return pages.join('\n\n').trim()
}

export async function extractDocxText(data: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth')
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: data })
    return value.replace(/\n{3,}/g, '\n\n').trim()
  } catch {
    throw new ExtractError('Could not read this DOCX file. Try saving it again from Word, or paste the text instead.')
  }
}

/** Extract plain text from an uploaded PDF or DOCX file. */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const buf = await file.arrayBuffer()
  let text: string
  if (name.endsWith('.pdf') || file.type === 'application/pdf') text = await extractPdfText(buf)
  else if (name.endsWith('.docx')) text = await extractDocxText(buf)
  else if (name.endsWith('.txt') || file.type.startsWith('text/')) text = new TextDecoder().decode(buf)
  else throw new ExtractError('Unsupported file type. Upload a PDF or DOCX, or paste your resume text.')
  if (text.trim().length < 30) {
    throw new ExtractError('No readable text was found. Scanned or image-only files are not supported; paste the text instead.')
  }
  return text
}
