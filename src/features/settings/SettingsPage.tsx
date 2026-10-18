import { useRef, useState } from 'react'
import { ErrorBanner, Modal, Spinner } from '@/components/ui'
import { useSyncExternalStore } from 'react'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { useAuth } from '@/lib/auth/store'
import { deleteCloudData, syncNow, useSyncStatus } from '@/lib/sync/engine'
import { AdminModels } from '@/features/settings/AdminModels'
import { useCanManageModels } from '@/lib/auth/useCanManageModels'
import { createLlm, getServerModels, getServerProviders, PROVIDERS, resolveModel, subscribeServerProviders } from '@/lib/llm'
import type { ProviderId } from '@/lib/llm'
import type { CloudProvider, ProviderChoice } from '@/lib/llm/providers'
import type { ConnectionStatus } from '@/lib/llm'
import { downloadBlob } from '@/lib/export/download'
import { createBackup, restoreBackup } from '@/store/backup'
import { useBank } from '@/store/bank'
import { useChats } from '@/store/chats'
import { useCoverLetters } from '@/store/coverLetters'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { useSettings } from '@/store/settings'
import type { ThemePref } from '@/store/settings'

export function SettingsPage() {
  const { provider, models, theme, update, setProvider, setModel, clearModel } = useSettings()
  const shown: ProviderId[] = provider === 'auto' ? ['groq', 'openrouter', 'inception'] : [provider]
  const server = useSyncExternalStore(subscribeServerProviders, getServerProviders)
  const serverModels = useSyncExternalStore(subscribeServerProviders, getServerModels)
  const keyState = (id: ProviderId) => (server === null ? 'checking…' : server.has(id as CloudProvider) ? 'available on server ✓' : 'not configured on server')
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [confirmCloud, setConfirmCloud] = useState(false)
  const auth = useAuth()
  const sync = useSyncStatus()
  const canManage = useCanManageModels()
  const fileRef = useRef<HTMLInputElement>(null)

  const test = async () => {
    setTesting(true)
    setStatus(null)
    setStatus(await createLlm({ provider, models }).testConnection())
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
    useChats.setState({ chats: [] })
    useBank.setState({ items: [] })
    setConfirmWipe(false)
    setMessage({ ok: true, text: 'All resumes, jobs, letters and your experience bank were deleted from this browser.' })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {canManage ? (
      <section className="card space-y-3" aria-labelledby="s-models">
        <h2 id="s-models" className="text-base font-semibold">
          AI models
        </h2>
        <div>
          <label htmlFor="provider" className="label">
            Provider
          </label>
          <select id="provider" className="input max-w-md" value={provider} onChange={(e) => { setProvider(e.target.value as ProviderChoice); setStatus(null) }}>
            <option value="auto">Auto (recommended): Groq improves, Inception writes, OpenRouter as fallback and checker</option>
            <option value="groq">Groq only</option>
            <option value="openrouter">OpenRouter only</option>
            <option value="inception">Inception only</option>
          </select>
          {provider === 'auto' && (
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              Groq answers first because it is fastest. If it fails or is rate-limited, OpenRouter takes over, then Inception. OpenRouter also fact-checks suggestions so a second, independent model reviews them. Providers without a key are skipped.
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((id) => (
            <div key={id}>
              <label htmlFor={`model-${id}`} className="label">
                {PROVIDERS[id].label.replace(/ \(.*\)/, '')} model
                <span className="font-normal"> · {keyState(id)}</span>
              </label>
              {serverModels?.allowed[id] ? (
                <select id={`model-${id}`} className="input" value={resolveModel(id, models[id])} onChange={(e) => setModel(id, e.target.value)}>
                  {serverModels.allowed[id].map((m) => (
                    <option key={m} value={m}>
                      {m}
                      {m === serverModels.defaults[id] ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input id={`model-${id}`} className="input" value={models[id] ?? ''} onChange={(e) => setModel(id, e.target.value)} placeholder={PROVIDERS[id].defaultModel} />
              )}
            </div>
          ))}
        </div>
        <div role="note" className="rounded-lg border border-spark-400 bg-spark-400/10 p-3 text-sm">
          <p>
            <strong>Cloud models.</strong> Your resume text and job descriptions are sent to {provider === 'auto' ? 'Groq / OpenRouter / Inception' : PROVIDERS[provider].label.replace(/ \(.*\)/, '')} to generate answers.
          </p>
          {server !== null && server.size === 0 && (
            <p className="mt-1">No AI provider is configured on this server. The site owner needs to set <code>GROQ_API_KEY</code>, <code>OPENROUTER_API_KEY</code> and/or <code>INCEPTION_API_KEY</code> in the server environment.</p>
          )}
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">API keys stay on the server and are never sent to your browser.</p>
        </div>
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
          <button type="button" className="btn-ghost" onClick={() => (Object.keys(PROVIDERS) as ProviderId[]).forEach(clearModel)}>
            Reset to defaults
          </button>
        </div>
        {status && (
          <div role="status" className={`rounded-lg border p-3 text-sm ${status.ok ? 'border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-100' : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'}`}>
            <p>{status.ok ? '✓ ' : '✗ '}{status.message}</p>
            {status.models.length > 0 && <p className="mt-1 text-xs">Model: {status.models.join(', ')}</p>}
          </div>
        )}
      </section>
      ) : (
        <section className="card space-y-2" aria-labelledby="s-ai">
          <h2 id="s-ai" className="text-base font-semibold">
            AI
          </h2>
          <p className="text-sm text-ink-600 dark:text-ink-300">AI features use the models chosen by the site administrator. Your resume text and job descriptions are sent through this site&apos;s server to its AI providers to generate answers; your API keys are never involved.</p>
        </section>
      )}

      {auth.required && (
        <section className="card space-y-3" aria-labelledby="s-account">
          <h2 id="s-account" className="text-base font-semibold">
            Account and cloud sync
          </h2>
          {auth.user ? (
            <>
              <p className="text-sm">
                Signed in as <strong>{auth.user.email}</strong>{' '}
                <span className="chip ml-1">{auth.isAdmin ? 'Admin' : auth.adminStatus === 'checking' ? 'Checking…' : auth.adminStatus === 'error' ? 'Unknown' : 'Member'}</span>. Your resumes, jobs and cover letters are synced to your account so they follow you across devices.
              </p>
              <div className="rounded-lg bg-ink-50 p-3 text-sm dark:bg-ink-800" aria-label="Account details">
                <p>
                  Your User ID: <code className="break-all font-mono text-xs">{auth.user.uid}</code>{' '}
                  <button type="button" className="btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(auth.user!.uid)} aria-label="Copy User ID">
                    Copy
                  </button>
                </p>
                {!auth.isAdmin && auth.adminStatus === 'member' && (
                  <p className="mt-2 text-ink-600 dark:text-ink-300">
                    No admin document was found for this User ID. In Firebase → Firestore → <code>admins</code>, the <strong>Document ID</strong> must be exactly the ID above.
                  </p>
                )}
                {auth.adminStatus === 'error' && (
                  <p role="alert" className="mt-2 text-red-700 dark:text-red-300">
                    {auth.adminMessage}
                  </p>
                )}
                {!auth.isAdmin && (
                  <button type="button" className="btn-secondary btn-sm mt-2" disabled={auth.adminStatus === 'checking'} onClick={() => void auth.recheckAdmin()}>
                    {auth.adminStatus === 'checking' ? 'Checking…' : 'Check admin status again'}
                  </button>
                )}
              </div>
              <p className="text-sm text-ink-500 dark:text-ink-400" role="status">
                {sync.state === 'syncing' ? 'Syncing…' : sync.state === 'error' ? `Sync problem: ${sync.error}` : sync.lastSynced ? `Last synced ${new Date(sync.lastSynced).toLocaleString()}` : 'Waiting for the first sync…'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => void syncNow()} disabled={sync.state === 'syncing'}>
                  Sync now
                </button>
                <button type="button" className="btn-secondary" onClick={() => void auth.signOut()}>
                  Sign out
                </button>
                <button type="button" className="btn-danger" onClick={() => setConfirmCloud(true)}>
                  Delete my cloud data
                </button>
              </div>
              <p className="text-xs text-ink-500 dark:text-ink-400">Signing out keeps the data already on this device. It stops syncing until you sign in again.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-600 dark:text-ink-300">Sign in with Google to use AI features and sync your data across devices. Editing and exporting work without an account.</p>
              <GoogleSignInButton />
            </>
          )}
        </section>
      )}

      <AdminModels />

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

      {confirmCloud && (
        <Modal title="Delete cloud data?" onClose={() => setConfirmCloud(false)}>
          <p className="text-sm">This removes your synced copy from the server and signs you out so it is not uploaded again. The data on this device stays.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirmCloud(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() =>
                void deleteCloudData().then(async (ok) => {
                  setConfirmCloud(false)
                  if (ok) await auth.signOut()
                  setMessage(ok ? { ok: true, text: 'Your cloud data was deleted.' } : { ok: false, text: 'Could not delete cloud data. Try again.' })
                })
              }
            >
              Delete cloud data
            </button>
          </div>
        </Modal>
      )}

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
