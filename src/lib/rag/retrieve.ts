import type { EmbeddingsInterface } from '@langchain/core/embeddings'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { BrowserEmbeddings } from './embeddings'
import { syncJobs, syncResumes } from './indexer'
import { IndexedDbVectorStore } from './vectorStore'

let embeddings: EmbeddingsInterface | null = null
/** The shared embeddings (one model download for the whole app). Tests can replace it. */
export const getEmbeddings = (): EmbeddingsInterface => (embeddings ??= new BrowserEmbeddings())
export const setEmbeddings = (e: EmbeddingsInterface | null): void => {
  embeddings = e
}

export interface RetrieveOptions {
  k?: number
  /** Give up after this long (the first call may be downloading the embedding model). */
  timeoutMs?: number
  /** The prompt the passages will join: what it already says is not repeated. */
  alreadyIn?: string
}

/** Messages this short ("thanks", "make it shorter") are answered from the conversation; searching would only add noise. */
const MIN_WORDS = 4

/**
 * Relevant passages from the user's resumes, job descriptions and imported files for a query, as one block of text
 * ('' when there is nothing useful or retrieval failed). Retrieval only ever improves a prompt, so it never throws.
 */
export async function retrieveContext(query: string, opts: RetrieveOptions = {}): Promise<string> {
  const { k = 4, timeoutMs = 6000, alreadyIn = '' } = opts
  if (query.trim().split(/\s+/).filter(Boolean).length < MIN_WORDS) return ''
  const work = (async () => {
    const e = getEmbeddings()
    const { resumes } = useResumes.getState()
    await syncResumes(resumes, e)
    await syncJobs(useJobs.getState().jobs, resumes, e)
    const hits = await new IndexedDbVectorStore(e).searchForPrompt(query, { k, promptText: alreadyIn })
    return hits.map((d) => `${d.metadata.header as string}\n${d.pageContent}`).join('\n---\n')
  })()
  try {
    return await Promise.race([work, new Promise<string>((resolve) => setTimeout(() => resolve(''), timeoutMs))])
  } catch {
    return ''
  }
}
