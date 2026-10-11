import { useState } from 'react'
import { importJobFromUrl, looksLikeUrl } from '@/lib/jobImport'
import type { ImportedJob } from '@/lib/jobImport'

/** "Paste a job link" row: fetches the posting through the server and hands the result to the caller. */
export function JobUrlImport({ initialUrl = '', existingDescription = '', onImport }: { initialUrl?: string; existingDescription?: string; onImport: (job: ImportedJob, url: string) => void }) {
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const run = async () => {
    if (busy) return
    if (!looksLikeUrl(url)) {
      setError('Paste a full link that starts with https://')
      return
    }
    setBusy(true)
    setError('')
    setDone('')
    try {
      const job = await importJobFromUrl(url)
      const current = existingDescription.trim()
      if (current && current !== job.description && !window.confirm('Replace the current job description with the one from this link?')) return
      onImport(job, url.trim())
      setDone(`Imported ${job.title || 'the job description'}${job.company ? ` at ${job.company}` : ''}. Check it over: pages are read automatically and can include extra text.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label htmlFor="job-url-import" className="label">
        Import from a job link
      </label>
      <div className="flex gap-2">
        <input
          id="job-url-import"
          type="url"
          className="input"
          value={url}
          placeholder="https://company.com/careers/job-123"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void run()
            }
          }}
          aria-describedby="job-url-import-msg"
        />
        <button type="button" className="btn-secondary shrink-0" disabled={busy || !url.trim()} onClick={() => void run()}>
          {busy ? 'Importing...' : 'Import'}
        </button>
      </div>
      <p id="job-url-import-msg" className={`mt-1 text-xs ${error ? 'text-red-600 dark:text-red-400' : 'text-ink-500'}`} role={error ? 'alert' : 'status'}>
        {error || done || 'Works with most company career pages and job boards. LinkedIn and Indeed block automatic access, so paste those descriptions.'}
      </p>
    </div>
  )
}
