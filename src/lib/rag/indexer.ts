import type { EmbeddingsInterface } from '@langchain/core/embeddings'
import { EMBEDDING_MODEL } from '@/lib/ats/embeddings'
import type { Job } from '@/types/job'
import type { Resume } from '@/types/resume'
import { clearAll, existingChunkIds, listSources, removeSource, replaceSource } from './db'
import type { SourceKind, SourceRecord } from './db'
import { hashText, loadImportedFile, loadJob, loadResume, loadTargetJob, passageText, splitSource } from './loaders'
import type { Source } from './loaders'

/** Runs index changes one at a time, so two requests syncing together never write over each other. */
let queue: Promise<unknown> = Promise.resolve()
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

/**
 * Split, embed and store one source. Skipped if it is unchanged. Only text that is not already in the database is
 * embedded, so a job description copied to five places costs one embedding.
 */
async function indexSource(source: Source, embeddings: EmbeddingsInterface, known: Map<string, SourceRecord>): Promise<boolean> {
  const passages = await splitSource(source)
  const hash = hashText(passages.map((p) => p.id).join())
  const prev = known.get(source.id)
  if (prev && prev.hash === hash && prev.model === EMBEDDING_MODEL) return false
  const have = await existingChunkIds(passages.map((p) => p.id))
  const fresh = passages.filter((p) => !have.has(p.id))
  const vectors = fresh.length ? await embeddings.embedDocuments(fresh.map(passageText)) : []
  const byId = new Map(fresh.map((p, i) => [p.id, vectors[i]!]))
  const record: SourceRecord = { id: source.id, kind: source.kind, title: source.title, hash, model: EMBEDDING_MODEL, chunkIds: [], updatedAt: Date.now() }
  await replaceSource(record, passages.map((p) => ({ id: p.id, header: p.header, body: p.body, kind: p.kind, vector: byId.get(p.id) })))
  known.set(source.id, { ...record, chunkIds: passages.map((p) => p.id) })
  return true
}

/** Vectors from another embedding model cannot be compared with this one's, so the index is rebuilt. */
async function currentSources(): Promise<Map<string, SourceRecord>> {
  let sources = await listSources()
  if (sources.some((s) => s.model !== EMBEDDING_MODEL)) {
    await clearAll()
    sources = []
  }
  return new Map(sources.map((s) => [s.id, s]))
}

/** Make the index hold exactly `wanted` for these kinds: new/changed sources are (re)embedded, gone ones removed. */
async function syncKinds(kinds: SourceKind[], wanted: Source[], embeddings: EmbeddingsInterface): Promise<void> {
  const known = await currentSources()
  const keep = new Set(wanted.map((s) => s.id))
  for (const s of known.values()) {
    if (kinds.includes(s.kind) && !keep.has(s.id)) {
      await removeSource(s.id)
      known.delete(s.id)
    }
  }
  for (const s of wanted) await indexSource(s, embeddings, known)
}

/**
 * Keep the index in step with the user's resumes. A tailored copy is left out while its base resume exists: it is
 * the same experience reworded for one job, so it would only crowd the results with near-duplicates.
 */
export function syncResumes(resumes: Resume[], embeddings: EmbeddingsInterface): Promise<void> {
  const ids = new Set(resumes.map((r) => r.id))
  const originals = resumes.filter((r) => !(r.baseResumeId && ids.has(r.baseResumeId)))
  return serial(() => syncKinds(['resume'], originals.map(loadResume), embeddings))
}

/** Keep the index in step with job descriptions: those saved in the tracker and the one each resume targets. */
export function syncJobs(jobs: Job[], resumes: Resume[], embeddings: EmbeddingsInterface): Promise<void> {
  const wanted = [...jobs.map(loadJob), ...resumes.map(loadTargetJob)].filter((s): s is Source => s !== null)
  return serial(() => syncKinds(['job'], wanted, embeddings))
}

/** Remember an imported PDF/DOCX so its content can inform later answers. */
export function indexImportedFile(name: string, text: string, embeddings: EmbeddingsInterface): Promise<boolean> {
  return serial(async () => indexSource(loadImportedFile(name, text), embeddings, await currentSources()))
}

/** Forget an imported file, e.g. once a resume built from it holds the same content. */
export function forgetImportedFile(name: string): Promise<void> {
  return serial(() => removeSource(loadImportedFile(name, '').id))
}
