import { ErrorBanner, ProgressBar, Spinner } from '@/components/ui'
import type { Check } from '@/lib/ats/score'
import type { Resume } from '@/types/resume'
import type { ResumeScore } from './useResumeScore'
import { WeakBullets } from './WeakBullets'

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

export function AtsPanel({ resume, scoring }: { resume: Resume; scoring: ResumeScore }) {
  const { report, semantic: state, semanticStale, runSemantic } = scoring

  return (
    <div className="space-y-4">
      <section className="card space-y-3" aria-label="Score breakdown">
        <div>
          <h2 className="text-base font-semibold">Score breakdown</h2>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Your overall score ({report.overall}/100, shown at the top) is a fixed-rule weighted sum of these parts, not guessed by the AI.
            {!report.hasJobDescription && ' Add a job description above to include keyword and semantic matching.'}
          </p>
        </div>
        {report.components.map((c) => (
          <div key={c.id}>
            <ProgressBar value={c.score} label={`${c.label} (${Math.round(c.weight * 100)}% of total)`} />
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{c.summary}</p>
          </div>
        ))}
        {report.hasJobDescription && (report.semanticPending || semanticStale || state.phase === 'loading') && (
          <div className="rounded-lg bg-ink-50 p-3 text-sm dark:bg-ink-800">
            <p className="mb-2">
              {report.semanticPending
                ? 'Semantic similarity is not included yet. It runs a small embedding model in your browser (about 25 MB, downloaded once, then cached).'
                : 'You edited your resume since the semantic match was calculated. Re-run it to refresh that part of the score.'}
            </p>
            {state.phase === 'loading' ? (
              <div className="space-y-1" aria-live="polite">
                <ProgressBar value={state.progress} label={state.label} />
                <span className="flex items-center gap-2 text-xs">
                  <Spinner label="Working" /> Working...
                </span>
              </div>
            ) : (
              <button type="button" className="btn-secondary btn-sm" onClick={() => void runSemantic()}>
                {report.semanticPending ? 'Run semantic match' : 'Re-run semantic match'}
              </button>
            )}
          </div>
        )}
        {state.phase === 'error' && (
          <ErrorBanner error={new Error('Could not load the embedding model. Check your internet connection for the one-time download and try again.')} />
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

      <WeakBullets resume={resume} />

      <section className="card grid gap-4 sm:grid-cols-2" aria-label="Checks">
        <Checks title="Section completeness" checks={report.completeness} />
        <Checks title="Formatting" checks={report.formatting} />
      </section>
    </div>
  )
}
