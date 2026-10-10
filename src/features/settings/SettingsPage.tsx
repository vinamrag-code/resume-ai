import { useRef, useState } from 'react'
import { ErrorBanner, Modal, Spinner } from '@/components/ui'
import { OnboardingSteps } from '@/features/onboarding/OnboardingSteps'
import { createLlm, envApiKey, PROVIDERS } from '@/lib/llm'
import type { ProviderId } from '@/lib/llm'
import type { ConnectionStatus } from '@/lib/llm'
import { downloadBlob } from '@/lib/export/download'
import { createBackup, restoreBackup } from '@/store/backup'
import { useCoverLetters } from '@/store/coverLetters'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { DEFAULT_OLLAMA_URL, useSettings } from '@/store/settings'
import type { ThemePref } from '@/store/settings'

export function SettingsPage() {
  const { provider, ollamaUrl, model, theme, update, setProvider, setModel } = useSettings()
  const info = PROVIDERS[provider]
  const hasKey = provider === 'ollama' || envApiKey(provider) !== ''
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const test = async () => {
    setTesting(true)
    setStatus(null)
    setStatus(await createLlm({ provider, ollamaUrl, model }).testConnection())
    setTesting(false)
  }

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(createBackup(), null, 2)], { type: 'application/json' })
    downloadBlob(blob, `resume-ai-backup-${new Date().toISOString().slice(0, 10)}.json`)
    setMessage({ ok: true, text: 'Backup downloaded.' })
  }

  const importAll = async (file: File | undefined) => {
    if (!file) return
    const res = restoreBackup(await file.text())
    setMessage(
      res.ok
        ? { ok: true, text: `Restored ${res.counts.resumes} resume(s), ${res.counts.jobs} job(s), ${res.counts.letters} letter(s).` }
        : { ok: false, text: res.error },
    )
    if (fileRef.current) fileRef.current.value = ''
  }

  const wipe = () => {
    useResumes.setState({ resumes: [] })
    useJobs.setState({ jobs: [] })
    useCoverLetters.setState({ letters: [] })
    setConfirmWipe(false)
    setMessage({ ok: true, text: 'All resumes, jobs and letters were deleted from this browser.' })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="card space-y-3" aria-labelledby="s-ollama">
        <h2 id="s-ollama" className="text-base font-semibold">
          AI provider
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="provider" className="label">
              Provider
            </label>
            <select id="provider" className="input" value={provider} onChange={(e) => { setProvider(e.target.value as ProviderId); setStatus(null) }}>
              {Object.values(PROVIDERS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ollama-model" className="label">
              Model
            </label>
            <input id="ollama-model" className="input" list="installed-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={info.defaultModel} />
            <datalist id="installed-models">
              {status?.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          {provider === 'ollama' && (
            <div className="sm:col-span-2">
              <label htmlFor="ollama-url" className="label">
                Ollama base URL
              </label>
              <input id="ollama-url" className="input" value={ollamaUrl} onChange={(e) => update({ ollamaUrl: e.target.value })} placeholder={DEFAULT_OLLAMA_URL} />
            </div>
          )}
        </div>
        {info.cloud && (
          <div role="note" className="rounded-lg border border-spark-400 bg-spark-400/10 p-3 text-sm">
            <p>
              <strong>Cloud provider.</strong> Your resume text and job descriptions are sent to {info.label.replace(/ \(.*\)/, '')} to generate answers.
            </p>
            <p className="mt-1">
              API key ({info.envKey}): <strong>{hasKey ? 'found in .env' : 'not found'}</strong>
              {!hasKey && ' - copy .env.example to .env, add your key, then restart `npm run dev`.'}
            </p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">Keys in .env are bundled into the page, so use this only on your own computer and never deploy a build that contains your key.</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={() => void test()} disabled={testing}>
            {testing ? (
              <>
                <Spinner label="Testing" /> Testing...
              </>
            ) : (
              'Test connection'
            )}
          </button>
          <button type="button" className="btn-ghost" onClick={() => { update({ ollamaUrl: DEFAULT_OLLAMA_URL }); setModel(info.defaultModel) }}>
            Reset to defaults
          </button>
        </div>
        {status && (
          <div role="status" className={`rounded-lg border p-3 text-sm ${status.ok ? 'border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-100' : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'}`}>
            <p>{status.ok ? '✓ ' : '✗ '}{status.message}</p>
            {status.models.length > 0 && <p className="mt-1 text-xs">Installed: {status.models.join(', ')}</p>}
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium">Ollama setup instructions</summary>
          <div className="mt-3">
            <OnboardingSteps />
          </div>
        </details>
        <button type="button" className="btn-ghost btn-sm" onClick={() => update({ onboarded: false })}>
          Show welcome guide again
        </button>
      </section>

      <section className="card space-y-3" aria-labelledby="s-theme">
        <h2 id="s-theme" className="text-base font-semibold">
          Appearance
        </h2>
        <div>
          <label htmlFor="theme" className="label">
            Theme
          </label>
          <select id="theme" className="input max-w-xs" value={theme} onChange={(e) => update({ theme: e.target.value as ThemePref })}>
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </section>

      <section className="card space-y-3" aria-labelledby="s-data">
        <h2 id="s-data" className="text-base font-semibold">
          Your data
        </h2>
        <p className="text-sm text-ink-500 dark:text-ink-400">Everything lives in this browser&apos;s storage. Export a backup before clearing browser data or switching computers.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={exportAll}>
            Export all data
          </button>
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
            Import data
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import backup file" onChange={(e) => void importAll(e.target.files?.[0])} />
          <button type="button" className="btn-danger" onClick={() => setConfirmWipe(true)}>
            Delete all data
          </button>
        </div>
        <p className="text-xs text-ink-500">Importing replaces your current resumes, jobs and cover letters.</p>
        {message && (message.ok ? <p role="status" className="text-sm text-brand-700 dark:text-brand-300">{message.text}</p> : <ErrorBanner error={new Error(message.text)} onDismiss={() => setMessage(null)} />)}
      </section>

      {confirmWipe && (
        <Modal title="Delete all data?" onClose={() => setConfirmWipe(false)}>
          <p className="text-sm">This permanently removes every resume, job and cover letter from this browser. Export a backup first if you might want them back.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirmWipe(false)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" onClick={wipe}>
              Delete everything
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
