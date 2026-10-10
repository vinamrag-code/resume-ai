import { useMemo } from 'react'
import { ErrorBanner, ProgressBar, Spinner } from '@/components/ui'
import { computeAtsScore } from '@/lib/ats/score'
import type { Check } from '@/lib/ats/score'
import type { Embedder, EmbedProgress } from '@/lib/ats/embeddings'
import { resumeToText } from '@/lib/resume'
import type { Resume } from '@/types/resume'
import { useSemantic } from './useSemantic'

function ScoreRing({ value }: { value: number }) {
  const color = value >= 75 ? 'text-brand-600' : value >= 50 ? 'text-spark-500' : 'text-red-600'
  return (
    <div className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-8 border-current ${color}`} role="img" aria-label={`Overall ATS score ${value} out of 100`}>
      <span className="text-3xl font-bold leading-none">{value}</span>
      <span className="text-[10px] text-ink-500">/ 100</span>
    </div>
  )
}

function Checks({ title, checks }: { title: string; checks: Check[] }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <ul className="space-y-1 text-sm">
        {checks.map((c) => (
          <li key={c.label} className="flex gap-2">
            <span aria-hidden="true" className={c.passed ? 'text-brand-600' : 'text-red-600'}>
              {c.passed ? '✓' : '✗'}
            </span>
            <span>
              <span className="sr-only">{c.passed ? 'Passed: ' : 'Failed: '}</span>
              {c.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AtsPanel({ resume, embedderFactory }: { resume: Resume; embedderFactory?: (p: (e: EmbedProgress) => void) => Embedder }) {
  const { state, run } = useSemantic(embedderFactory)
  const jd = resume.target.description
  const text = useMemo(() => resumeToText(resume.content), [resume.content])
  const key = `${text}\u0000${jd}`
  const similarity = state.phase === 'done' && state.key === key ? state.similarity : undefined
  const report = useMemo(() => computeAtsScore({ content: resume.content, jobDescription: jd, semanticSimilarity: similarity }), [resume.content, jd, similarity])

  return (
    <div className="space-y-4">
      <section className="card flex items-center gap-4" aria-labelledby="ats-h">
        <ScoreRing value={report.overall} />
        <div>
          <h2 id="ats-h" className="text-base font-semibold">
            ATS score
          </h2>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Computed by fixed rules from the parts below, not guessed by the AI.
            {!report.hasJobDescription && ' Add a job description above to include keyword and semantic matching.'}
          </p>
        </div>
      </section>

      <section className="card space-y-3" aria-label="Score breakdown">
        <h3 className="text-sm font-semibold">Breakdown</h3>
        {report.components.map((c) => (
          <div key={c.id}>
            <ProgressBar value={c.score} label={`${c.label} (${Math.round(c.weight * 100)}% of total)`} />
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{c.summary}</p>
          </div>
        ))}
        {report.hasJobDescription && report.semanticPending && (
          <div className="rounded-lg bg-ink-50 p-3 text-sm dark:bg-ink-800">
            <p className="mb-2">Semantic similarity is not included yet. It runs a small embedding model in your browser (about 25 MB, downloaded once, then cached).</p>
            {state.phase === 'loading' ? (
              <div className="space-y-1" aria-live="polite">
                <ProgressBar value={state.progress} label={state.label} />
                <span className="flex items-center gap-2 text-xs">
                  <Spinner label="Working" /> Working...
                </span>
              </div>
            ) : (
              <button type="button" className="btn-secondary btn-sm" onClick={() => void run(text, jd)}>
                Run semantic match
              </button>
            )}
            {state.phase === 'error' && (
              <div className="mt-2">
                <ErrorBanner error={new Error('Could not load the embedding model. Check your internet connection for the one-time download and try again.')} />
              </div>
            )}
          </div>
        )}
        {report.hasJobDescription && !report.semanticPending && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => void run(text, jd)}>
            Re-run semantic match
          </button>
        )}
      </section>

      {report.hasJobDescription && (
        <section className="card space-y-3" aria-label="Keywords">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Missing keywords ({report.missingKeywords.length})</h3>
            {report.missingKeywords.length === 0 ? (
              <p className="text-sm text-ink-500">Nothing missing. Nice.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {report.missingKeywords.map((k) => (
                  <li key={k.term} className="chip bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {k.term}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">Only add a keyword if it truthfully describes your experience.</p>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Matched keywords ({report.matchedKeywords.length})</h3>
            <ul className="flex flex-wrap gap-1.5">
              {report.matchedKeywords.map((k) => (
                <li key={k.term} className="chip bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100">
                  {k.term}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="card" aria-label="Fixes">
        <h3 className="mb-1 text-sm font-semibold">Suggested fixes</h3>
        {report.fixes.length === 0 ? (
          <p className="text-sm text-ink-500">No fixes needed.</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {report.fixes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>
        )}
      </section>

      {report.weakBullets.length > 0 && (
        <section className="card" aria-label="Weak bullets">
          <h3 className="mb-2 text-sm font-semibold">Bullets to improve ({report.weakBullets.length})</h3>
          <ul className="space-y-2 text-sm">
            {report.weakBullets.slice(0, 8).map((b, i) => (
              <li key={i} className="rounded-lg border border-ink-200 p-2 dark:border-ink-700">
                <p>&ldquo;{b.text}&rdquo;</p>
                <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  {b.score}/100 · {b.issues.join('; ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card grid gap-4 sm:grid-cols-2" aria-label="Checks">
        <Checks title="Section completeness" checks={report.completeness} />
        <Checks title="Formatting" checks={report.formatting} />
      </section>
    </div>
  )
}
