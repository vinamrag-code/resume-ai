import { cosine } from '@/lib/ats/embeddings'
import { extractKeywords, matchKeywords } from '@/lib/ats/keywords'
import type { ChunkRecord, SourceRecord } from './db'

export interface RankOptions {
  /** How many passages to return. */
  k: number
  /** The prompt the passages will be added to; passages it already contains are not repeated. */
  promptText?: string
  /** A passage needs this cosine similarity, or enough keyword coverage, to be considered at all. */
  minCosine?: number
  minKeywords?: number
  /** 1 = pure relevance, lower = more variety between the passages picked. */
  lambda?: number
  /** Passages at least this similar to one already picked are treated as the same thing. */
  nearDuplicate?: number
}

const SEMANTIC_WEIGHT = 0.7
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
/** Cosine similarities between related text sit around 0.2-0.6; stretch that into 0..1. */
const toUnit = (sim: number) => Math.max(0, Math.min(1, (sim - 0.1) / 0.5))

/** The bullet/line texts of a passage, without list markers. */
const contentLines = (body: string) => body.split('\n').map((l) => normalize(l.replace(/^[-•*]\s*/, ''))).filter((l) => l.length >= 12)

/** True when (nearly) all of a passage's lines are already in the prompt. */
function inPrompt(c: ChunkRecord, prompt: string): boolean {
  const ls = contentLines(c.body)
  return ls.length > 0 && ls.filter((l) => prompt.includes(l)).length / ls.length >= 0.8
}

/**
 * Pick the passages worth adding to a prompt:
 *  1. drop what the prompt already says, and every source that is mostly in it (e.g. the resume being edited);
 *  2. score the rest by meaning (embedding) blended with exact keyword coverage, so terms like "Kubernetes" count;
 *  3. choose greedily by maximal marginal relevance, so each pick adds something the earlier ones did not.
 */
export function rankChunks(chunks: ChunkRecord[], sources: SourceRecord[], queryVector: number[], queryText: string, opts: RankOptions): ChunkRecord[] {
  const { k, promptText = '', minCosine = 0.25, minKeywords = 0.2, lambda = 0.65, nearDuplicate = 0.92 } = opts
  const prompt = normalize(promptText)
  const already = new Set(prompt ? chunks.filter((c) => inPrompt(c, prompt)).map((c) => c.id) : [])
  const covered = new Set(sources.filter((s) => s.chunkIds.length && s.chunkIds.filter((id) => already.has(id)).length / s.chunkIds.length >= 0.5).map((s) => s.id))

  const keywords = extractKeywords(queryText, 30)
  const candidates = chunks
    .filter((c) => c.vector.length === queryVector.length && !already.has(c.id) && !c.sources.every((s) => covered.has(s)))
    .map((c) => {
      const cos = cosine(queryVector, c.vector)
      const kw = matchKeywords(keywords, `${c.header} ${c.body}`).coverage
      return { c, cos, kw, rel: SEMANTIC_WEIGHT * toUnit(cos) + (1 - SEMANTIC_WEIGHT) * Math.min(1, kw * 2) }
    })
    .filter((x) => x.cos >= minCosine || x.kw >= minKeywords)

  const picked: typeof candidates = []
  while (picked.length < k && candidates.length) {
    let best = -1
    let bestScore = -Infinity
    for (let i = 0; i < candidates.length; i++) {
      const x = candidates[i]!
      const sim = picked.reduce((m, p) => Math.max(m, cosine(x.c.vector, p.c.vector)), 0)
      if (sim >= nearDuplicate) {
        candidates.splice(i--, 1)
        continue
      }
      const score = lambda * x.rel - (1 - lambda) * sim
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best === -1) break
    picked.push(candidates.splice(best, 1)[0]!)
  }
  return picked.map((x) => x.c)
}
