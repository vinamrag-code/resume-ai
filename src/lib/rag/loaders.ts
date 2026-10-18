import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { Job } from '@/types/job'
import type { Resume } from '@/types/resume'
import { asKind } from './db'
import type { SourceKind } from './db'

/** A long entry is split at paragraph, line and sentence boundaries, with a little overlap. */
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 700, chunkOverlap: 100, separators: ['\n\n', '\n', '. ', ' ', ''] })

export const resumeSourceId = (resumeId: string) => `resume:${resumeId}`
export const jobSourceId = (jobId: string) => `job:${jobId}`
export const targetSourceId = (resumeId: string) => `target:${resumeId}`
export const fileSourceId = (name: string) => `file:${name.trim().toLowerCase()}`

/**
 * Something to index: LangChain `Document`s (the loader's output) that share an id. Each document's `header` says
 * where it comes from and is stored with every passage cut from it.
 */
export interface Source {
  id: string
  kind: SourceKind
  title: string
  docs: Document[]
}

const doc = (body: string, header: string, kind: SourceKind, sourceId: string) => new Document({ pageContent: body, metadata: { header, kind, sourceId } })
const lines = (...xs: (string | false | undefined)[]) => xs.filter((x): x is string => !!x && x.trim() !== '').join('\n')
const bullets = (bs: string[]) => bs.filter((b) => b.trim()).map((b) => `- ${b}`)
const dates = (start: string, end: string) => (start || end ? `(${start} - ${end})` : '')

/**
 * Document loader for a resume. It is cut by structure, not by character count: one document per experience
 * entry, project and education entry, plus summary, skills and certifications. Contact details are left out (they
 * answer no question and every resume has them).
 */
export function loadResume(resume: Resume): Source {
  const c = resume.content
  const id = resumeSourceId(resume.id)
  const head = (section: string, more = '') => `[Resume: ${resume.name} · ${section}${more ? ` · ${more}` : ''}]`
  const docs: Document[] = []
  if (c.summary.trim()) docs.push(doc(c.summary, head('Summary'), 'resume', id))
  for (const e of c.experience) docs.push(doc(lines(`${e.title} - ${e.company} ${e.location} ${dates(e.start, e.end)}`.replace(/\s+/g, ' ').trim(), ...bullets(e.bullets)), head('Experience', e.company || e.title), 'resume', id))
  for (const p of c.projects) docs.push(doc(lines(p.name, ...bullets(p.bullets)), head('Projects', p.name), 'resume', id))
  for (const e of c.education) docs.push(doc(lines(`${e.degree} ${e.field} - ${e.school} ${dates(e.start, e.end)}`.replace(/\s+/g, ' ').trim(), ...bullets(e.details)), head('Education', e.school), 'resume', id))
  if (c.skills.length) docs.push(doc(c.skills.join(', '), head('Skills'), 'resume', id))
  if (c.certifications.length) docs.push(doc(c.certifications.map((x) => `${x.name} ${x.issuer} ${x.date}`.replace(/\s+/g, ' ').trim()).join('\n'), head('Certifications'), 'resume', id))
  return { id, kind: 'resume', title: resume.name, docs }
}

const jobHeader = (title: string, company: string) => `[Job: ${[title, company].filter(Boolean).join(' at ') || 'untitled'}]`

/** Document loader: a tracked job's posting (null when it has no description to search). */
export function loadJob(job: Job): Source | null {
  if (!job.description.trim()) return null
  const id = jobSourceId(job.id)
  const header = jobHeader(job.title, job.company)
  return { id, kind: 'job', title: header, docs: [doc(job.description, header, 'job', id)] }
}

/** Document loader: the job a resume is aimed at (null when none was entered). */
export function loadTargetJob(resume: Resume): Source | null {
  const { title, company, description } = resume.target
  if (!description.trim()) return null
  const id = targetSourceId(resume.id)
  const header = jobHeader(title, company)
  return { id, kind: 'job', title: header, docs: [doc(description, header, 'job', id)] }
}

/** Document loader: text extracted from an imported PDF/DOCX (see `extractText`). */
export function loadImportedFile(name: string, text: string): Source {
  const id = fileSourceId(name)
  const header = `[File: ${name}]`
  return { id, kind: 'file', title: name, docs: [doc(text, header, 'file', id)] }
}

export interface Passage {
  header: string
  body: string
  kind: SourceKind
  /** Hash of header + body: the passage's identity. */
  id: string
}

/** Text splitting: every document becomes one or more passages, each starting with its header. Repeats are dropped. */
export async function splitSource(source: Source): Promise<Passage[]> {
  const out = new Map<string, Passage>()
  for (const d of source.docs) {
    const header = String(d.metadata.header ?? '')
    const text = d.pageContent.trim()
    if (!text) continue
    const bodies = text.length <= 700 ? [text] : (await splitter.splitText(text)).map((b) => b.trim()).filter(Boolean)
    for (const body of bodies) {
      const id = hashText(`${header}\n${body}`)
      out.set(id, { header, body, kind: asKind(d.metadata.kind), id })
    }
  }
  return [...out.values()]
}

/** What the embedding model reads for a passage. */
export const passageText = (p: { header: string; body: string }) => `${p.header}\n${p.body}`

/** Stable 53-bit hash (cyrb53) of a string: two different passages colliding is not a practical concern at this scale. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}
