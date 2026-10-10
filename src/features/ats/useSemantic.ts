import { useCallback, useRef, useState } from 'react'
import { createTransformersEmbedder, semanticSimilarity } from '@/lib/ats/embeddings'
import type { Embedder, EmbedProgress } from '@/lib/ats/embeddings'

export interface SemanticState {
  phase: 'idle' | 'loading' | 'done' | 'error'
  progress: number
  label: string
  error?: unknown
  /** Last computed similarity. Kept after edits so the overall score stays stable (see `key`). */
  similarity?: number
  /** The resume + job text the similarity was computed for. */
  key?: string
}

/** Runs the in-browser embedding model on demand and reports download progress. */
export function useSemantic(embedderFactory?: (onProgress: (p: EmbedProgress) => void) => Embedder) {
  const [state, setState] = useState<SemanticState>({ phase: 'idle', progress: 0, label: '' })
  const files = useRef(new Map<string, number>())

  const run = useCallback(
    async (resumeText: string, jobText: string) => {
      files.current.clear()
      setState((s) => ({ ...s, phase: 'loading', progress: 0, label: 'Preparing embedding model', error: undefined }))
      const onProgress = (p: EmbedProgress) => {
        if (p.status === 'progress' && p.file && typeof p.progress === 'number') {
          files.current.set(p.file, p.progress)
          const vals = [...files.current.values()]
          const avg = vals.reduce((s, v) => s + v, 0) / vals.length
          setState((s) => ({ ...s, phase: 'loading', progress: avg, label: `Downloading embedding model (${files.current.size} files)` }))
        } else if (p.status === 'ready' || p.status === 'done') {
          setState((s) => (s.phase === 'loading' ? { ...s, progress: 100, label: 'Analysing' } : s))
        }
      }
      try {
        const embedder = (embedderFactory ?? createTransformersEmbedder)(onProgress)
        const similarity = await semanticSimilarity(embedder, resumeText, jobText)
        setState({ phase: 'done', progress: 100, label: '', similarity, key: `${resumeText}\u0000${jobText}` })
      } catch (error) {
        setState((s) => ({ ...s, phase: 'error', error }))
      }
    },
    [embedderFactory],
  )
  return { state, run }
}
