export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'

export interface EmbedProgress {
  status: string
  /** 0..100 when known. */
  progress?: number
  file?: string
}

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Split into ~maxWords chunks on sentence/line boundaries (the model only reads ~256 tokens). */
export function chunkText(text: string, maxWords = 90): string[] {
  const pieces = text.split(/(?<=[.!?])\s+|\n+/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let cur: string[] = []
  let count = 0
  for (const p of pieces) {
    const n = p.split(/\s+/).length
    if (count + n > maxWords && cur.length) {
      chunks.push(cur.join(' '))
      cur = []
      count = 0
    }
    cur.push(p)
    count += n
  }
  if (cur.length) chunks.push(cur.join(' '))
  return chunks.slice(0, 24)
}

/**
 * Semantic similarity (-1..1): for every job-description chunk take its best-matching resume chunk,
 * then average. Robust to the resume being longer than the model's input window.
 */
export async function semanticSimilarity(embedder: Embedder, resumeText: string, jobText: string): Promise<number> {
  const resumeChunks = chunkText(resumeText)
  const jobChunks = chunkText(jobText)
  if (!resumeChunks.length || !jobChunks.length) return 0
  const vectors = await embedder.embed([...resumeChunks, ...jobChunks])
  const rv = vectors.slice(0, resumeChunks.length)
  const jv = vectors.slice(resumeChunks.length)
  const best = jv.map((j) => Math.max(...rv.map((r) => cosine(r, j))))
  return best.reduce((s, x) => s + x, 0) / best.length
}

/** Map cosine similarity to a 0..100 score (sentence-embedding similarities for related text sit around 0.3-0.7). */
export function similarityToScore(sim: number): number {
  return Math.round(Math.max(0, Math.min(1, (sim - 0.15) / 0.55)) * 100)
}

interface Extractor {
  (texts: string[], opts: { pooling: 'mean'; normalize: boolean }): Promise<{ tolist(): number[][] }>
}

let extractorPromise: Promise<Extractor> | null = null

/** In-browser embedder backed by transformers.js. The model downloads once and is cached by the browser. */
export function createTransformersEmbedder(onProgress?: (p: EmbedProgress) => void): Embedder {
  return {
    async embed(texts) {
      if (!extractorPromise) {
        extractorPromise = (async () => {
          const { pipeline, env } = await import('@huggingface/transformers')
          env.allowLocalModels = false
          const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, {
            progress_callback: (p: EmbedProgress) => onProgress?.(p),
          })
          return extractor as unknown as Extractor
        })().catch((err: unknown) => {
          extractorPromise = null
          throw err
        })
      }
      const extractor = await extractorPromise
      const out = await extractor(texts, { pooling: 'mean', normalize: true })
      return out.tolist()
    },
  }
}
