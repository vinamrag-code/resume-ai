import { useState, useSyncExternalStore } from 'react'
import { ErrorBanner } from '@/components/ui'
import { parseModelList, saveModelConfig } from '@/lib/admin/models'
import { useAuth } from '@/lib/auth/store'
import { CLOUD_PROVIDERS, getServerModels, loadServerProviders, PROVIDERS, subscribeServerProviders } from '@/lib/llm'
import type { CloudProvider } from '@/lib/llm/providers'

/** Admin-only: add models to the allowlist and choose which one is the default for everyone. */
export function AdminModels() {
  const isAdmin = useAuth((s) => s.isAdmin)
  const current = useSyncExternalStore(subscribeServerProviders, getServerModels)
  const [lists, setLists] = useState<Record<CloudProvider, string>>(() => ({
    groq: (current?.allowed.groq ?? [PROVIDERS.groq.defaultModel]).join('\n'),
    openrouter: (current?.allowed.openrouter ?? [PROVIDERS.openrouter.defaultModel]).join('\n'),
  }))
  const [defaults, setDefaults] = useState<Record<CloudProvider, string>>(() => ({
    groq: current?.defaults.groq ?? PROVIDERS.groq.defaultModel,
    openrouter: current?.defaults.openrouter ?? PROVIDERS.openrouter.defaultModel,
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  if (!isAdmin) return null

  const parsed = Object.fromEntries(CLOUD_PROVIDERS.map((id) => [id, parseModelList(lists[id])])) as Record<CloudProvider, ReturnType<typeof parseModelList>>

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const allowed = { groq: parsed.groq.models, openrouter: parsed.openrouter.models }
      // A default that is no longer in the list falls back to the first model.
      const fixed = Object.fromEntries(CLOUD_PROVIDERS.map((id) => [id, allowed[id].includes(defaults[id]) ? defaults[id] : (allowed[id][0] ?? '')])) as Record<CloudProvider, string>
      await saveModelConfig({ allowed, defaults: fixed })
      setDefaults(fixed)
      await loadServerProviders()
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error && e.message.includes('permission') ? new Error('Saving was refused. Make sure your account has an admins document and the Firestore rules are published.') : e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card space-y-4" aria-labelledby="s-admin">
      <div>
        <h2 id="s-admin" className="text-base font-semibold">
          Admin: AI models
        </h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Only you see this. Models listed here are the only ones the server will call, and the default is what everyone uses unless they pick another allowed one. Changes reach all users within about a minute.
        </p>
      </div>
      {CLOUD_PROVIDERS.map((id) => (
        <div key={id} className="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <div>
            <label htmlFor={`admin-${id}`} className="label">
              {PROVIDERS[id].label.replace(/ \(.*\)/, '')} models (one per line)
            </label>
            <textarea id={`admin-${id}`} rows={4} className="input font-mono text-xs" value={lists[id]} onChange={(e) => { setLists({ ...lists, [id]: e.target.value }); setSaved(false) }} />
            {parsed[id].invalid.length > 0 && <p className="mt-1 text-xs text-red-700 dark:text-red-300">Ignored invalid names: {parsed[id].invalid.join(', ')}</p>}
          </div>
          <div>
            <label htmlFor={`admin-default-${id}`} className="label">
              Default {PROVIDERS[id].label.replace(/ \(.*\)/, '')} model
            </label>
            <select id={`admin-default-${id}`} className="input" value={parsed[id].models.includes(defaults[id]) ? defaults[id] : (parsed[id].models[0] ?? '')} onChange={(e) => { setDefaults({ ...defaults, [id]: e.target.value }); setSaved(false) }}>
              {parsed[id].models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save models'}
        </button>
        {saved && (
          <span role="status" className="text-sm text-brand-700 dark:text-brand-300">
            Saved. Everyone now uses these models.
          </span>
        )}
      </div>
    </section>
  )
}
