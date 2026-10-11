import { BankList } from './BankList'

/** Experience bank: where everything you have done is stored once. Building resumes from it happens on the Resumes page. */
export function BankPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Experience bank</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Store your jobs, projects and achievements once, exactly as you want them worded. Build or edit a resume from them on the Resumes page.</p>
      </div>
      <BankList />
    </div>
  )
}
