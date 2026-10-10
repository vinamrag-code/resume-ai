import { useMemo } from 'react'
import { computeAtsScore } from '@/lib/ats/score'
import type { Embedder, EmbedProgress } from '@/lib/ats/embeddings'
import { resumeToText } from '@/lib/resume'
import type { Resume } from '@/types/resume'
import { useSemantic } from './useSemantic'

/** The single source of truth for a resume's overall ATS score, shared by the header, ATS tab and Tailor tab. */
export function useResumeScore(resume: Resume, embedderFactory?: (p: (e: EmbedProgress) => void) => Embedder) {
  const { state, run } = useSemantic(embedderFactory)
  const jd = resume.target.description
  const text = useMemo(() => resumeToText(resume.content), [resume.content])
  const key = `${text}\u0000${jd}`
  const report = useMemo(
    () => computeAtsScore({ content: resume.content, jobDescription: jd, semanticSimilarity: state.similarity }),
    [resume.content, jd, state.similarity],
  )
  return {
    report,
    semantic: state,
    /** Semantic similarity was computed for older text; re-run to refresh. */
    semanticStale: state.similarity !== undefined && state.key !== key,
    runSemantic: () => run(text, jd),
    similarity: state.similarity,
  }
}
export type ResumeScore = ReturnType<typeof useResumeScore>
