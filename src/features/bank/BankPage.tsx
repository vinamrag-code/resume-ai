import { useSearchParams } from 'react-router-dom'
import { BankList } from './BankList'
import { BuildPanel } from './BuildPanel'

/** Experience bank: store everything once, then build a resume for each job from the best matches. */
export function BankPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'build' ? 'build' : 'items'
  const tabs = [
    { id: 'items', label: 'My experience' },
    { id: 'build', label: 'Build a resume for a job' },
  ] as const
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Experience bank</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Write your projects, jobs and achievements once. For each job, the most relevant ones are found with an embedding model that runs in your browser, and a resume is built from them.</p>
      </div>
      <div role="tablist" aria-label="Experience bank" className="flex gap-1 border-b border-ink-200 dark:border-ink-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === 'build' ? { tab: 'build', ...(params.get('from') ? { from: params.get('from')! } : {}) } : {})}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300' : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === 'build' ? <BuildPanel initialResumeId={params.get('from') ?? undefined} /> : <BankList />}</div>
    </div>
  )
}
