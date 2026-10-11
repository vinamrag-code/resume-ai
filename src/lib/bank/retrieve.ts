import { chunkText, cosine } from '@/lib/ats/embeddings'
import type { Embedder } from '@/lib/ats/embeddings'
import { extractKeywords, matchKeywords } from '@/lib/ats/keywords'
import type { BankItem } from '@/types/bank'

/** The text that represents an item to the embedding model (it only reads ~256 tokens, so this stays compact). */
export function itemText(item: BankItem): string {
  return [item.title, item.org, item.skills.join(', '), ...item.bullets].filter(Boolean).join('. ')
}

export interface RankedItem {
  item: BankItem
  /** 0..1, higher is more relevant. */
  score: number
  /** Embedding similarity (0..1) when the model was available. */
  semantic?: number
  /** Share of the job's weighted keywords found in the item (0..1). */
  keywords: number
  /** Job keywords that appear in the item (shown as "why this was chosen"). */
  matched: string[]
}

export interface RankResult {
  ranked: RankedItem[]
  /** True when only keywords were used (the embedding model could not run). */
  keywordOnly: boolean
}

const SEMANTIC_WEIGHT = 0.7
/** Cosine similarities between related text sit around 0.2-0.6; stretch that into 0..1. */
const toUnit = (sim: number) => Math.max(0, Math.min(1, (sim - 0.1) / 0.5))

/** Mean of the best few matches: an item is relevant if it answers several of the job's requirements, not just one. */
const meanTop = (xs: number[], n = 3) => {
  const top = [...xs].sort((a, b) => b - a).slice(0, n)
  return top.length ? top.reduce((s, x) => s + x, 0) / top.length : 0
}

const cache = new Map<string, number[]>()

/** Embed texts, computing only the ones not seen before (the same text always gives the same vector). */
export async function embedCached(embedder: Embedder, texts: string[]): Promise<number[][]> {
  const missing = [...new Set(texts.filter((t) => !cache.has(t)))]
  if (missing.length) {
    const vectors = await embedder.embed(missing)
    missing.forEach((t, i) => cache.set(t, vectors[i]!))
    if (cache.size > 2000) for (const k of [...cache.keys()].slice(0, 500)) cache.delete(k)
  }
  return texts.map((t) => cache.get(t) ?? [])
}

export function clearEmbeddingCache(): void {
  cache.clear()
}

/**
 * Retrieval: rank bank items for a job. Semantic similarity (embeddings) is blended with keyword coverage so exact
 * terms like "Kubernetes" still count. Without an embedder, or if it fails, keywords alone decide.
 */
export async function rankItems(items: BankItem[], jobText: string, embedder?: Embedder): Promise<RankResult> {
  const keywords = extractKeywords(jobText, 30)
  const kw = items.map((item) => matchKeywords(keywords, itemText(item)))
  let semantic: number[] | null = null
  const jobChunks = chunkText(jobText)
  if (embedder && items.length && jobChunks.length) {
    try {
      const vectors = await embedCached(embedder, [...items.map(itemText), ...jobChunks])
      const iv = vectors.slice(0, items.length)
      const jv = vectors.slice(items.length)
      // Each job chunk (a requirement) finds the items that answer it; an item scores by its best few requirements.
      semantic = iv.map((v) => toUnit(meanTop(jv.map((j) => cosine(v, j)))))
    } catch {
      semantic = null
    }
  }
  const ranked = items
    .map((item, i): RankedItem => {
      const k = kw[i]!
      const sem = semantic?.[i]
      return {
        item,
        keywords: k.coverage,
        semantic: sem,
        matched: k.matched.map((m) => m.term),
        score: sem === undefined ? k.coverage : SEMANTIC_WEIGHT * sem + (1 - SEMANTIC_WEIGHT) * Math.min(1, k.coverage * 2),
      }
    })
    .sort((a, b) => b.score - a.score || (b.item.updatedAt ?? b.item.createdAt) - (a.item.updatedAt ?? a.item.createdAt))
  return { ranked, keywordOnly: semantic === null }
}

/**
 * Pick the most relevant bullets of one item for a job (original order kept so the story still reads in sequence).
 * Items with few bullets keep them all.
 */
export async function pickBullets(item: BankItem, jobText: string, max: number, embedder?: Embedder): Promise<string[]> {
  const bullets = item.bullets.map((b) => b.trim()).filter(Boolean)
  if (bullets.length <= max) return bullets
  const keywords = extractKeywords(jobText, 30)
  let sem: number[] | null = null
  const jobChunks = chunkText(jobText)
  if (embedder && jobChunks.length) {
    try {
      const v = await embedCached(embedder, [...bullets, ...jobChunks])
      const bv = v.slice(0, bullets.length)
      const jv = v.slice(bullets.length)
      sem = bv.map((b) => toUnit(Math.max(...jv.map((j) => cosine(b, j)))))
    } catch {
      sem = null
    }
  }
  const scored = bullets.map((b, i) => {
    const k = matchKeywords(keywords, b).coverage
    return { b, i, s: sem ? SEMANTIC_WEIGHT * sem[i]! + (1 - SEMANTIC_WEIGHT) * Math.min(1, k * 2) : k }
  })
  return scored
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.b)
}
