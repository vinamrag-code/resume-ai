import { Link, useSearchParams } from 'react-router-dom'
import { BuildPanel } from './BuildPanel'

/** Build a new resume for one job from the experience bank (reached from the Resumes page). */
export function BuildPage() {
  const [params] = useSearchParams()
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <Link to="/resumes" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
          Back to your resumes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Build a resume from your experience bank</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Give the job, and the most relevant projects and achievements in your <Link to="/bank" className="underline">experience bank</Link> are found with an embedding model that runs in your browser. Then a resume is built from them.</p>
      </div>
      <BuildPanel initialResumeId={params.get('from') ?? undefined} />
    </div>
  )
}
