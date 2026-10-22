import { IconCheck, IconX } from '@tabler/icons-react'
import { useState, useSyncExternalStore } from 'react'
import { ErrorBanner, Spinner } from '@/components/ui'
import { parseModelList, saveModelConfig } from '@/lib/admin/models'
import { useAuth } from '@/lib/auth/store'
import { CLOUD_PROVIDERS, DEFAULT_ROLES, getServerModels, loadServerProviders, PIPELINE_ROLES, PROVIDERS, subscribeServerProviders, testProviderConnection } from '@/lib/llm'
import type { CloudProvider, PipelineRole } from '@/lib/llm/providers'
import type { ConnectionStatus } from '@/lib/llm/types'

const ROLE_LABEL: Record<PipelineRole, string> = { writer: 'Generates response', editor: 'Improvise', fallback: 'Fallback' }
const ROLE_HELP: Record<PipelineRole, string> = {
  writer: 'Writes the actual answer the user sees.',
  editor: 'Rewrites the prompt with helpful context, then polishes the answer before it is shown.',
  fallback: 'Backs up the other two roles if they fail or are rate-limited, and double-checks suggestions independently.',
}

/** Admin-only: add models to the allowlist and choose which one is the default for everyone. */
export function AdminModels() {
  const isAdmin = useAuth((s) => s.isAdmin)
  const current = useSyncExternalStore(subscribeServerProviders, getServerModels)
  const [lists, setLists] = useState<Record<CloudProvider, string>>(() => ({
    groq: (current?.allowed.groq ?? [PROVIDERS.groq.defaultModel]).join('\n'),
    openrouter: (current?.allowed.openrouter ?? [PROVIDERS.openrouter.defaultModel]).join('\n'),
    inception: (current?.allowed.inception ?? [PROVIDERS.inception.defaultModel]).join('\n'),
  }))
  const [defaults, setDefaults] = useState<Record<CloudProvider, string>>(() => ({
    groq: current?.defaults.groq ?? PROVIDERS.groq.defaultModel,
    openrouter: current?.defaults.openrouter ?? PROVIDERS.openrouter.defaultModel,
    inception: current?.defaults.inception ?? PROVIDERS.inception.defaultModel,
  }))
  const [roles, setRoles] = useState<Record<PipelineRole, CloudProvider>>(() => ({ ...DEFAULT_ROLES, ...current?.roles }))
  const [roleStatus, setRoleStatus] = useState<Partial<Record<PipelineRole, ConnectionStatus>>>({})
  const [roleTesting, setRoleTesting] = useState<Partial<Record<PipelineRole, boolean>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  if (!isAdmin) return null

  const parsed = Object.fromEntries(CLOUD_PROVIDERS.map((id) => [id, parseModelList(lists[id])])) as Record<CloudProvider, ReturnType<typeof parseModelList>>

  const testRole = async (role: PipelineRole) => {
    setRoleTesting({ ...roleTesting, [role]: true })
    setRoleStatus({ ...roleStatus, [role]: undefined })
    const id = roles[role]
    const model = parsed[id].models.includes(defaults[id]) ? defaults[id] : (parsed[id].models[0] ?? PROVIDERS[id].defaultModel)
    const result = await testProviderConnection(id, model)
    setRoleTesting((t) => ({ ...t, [role]: false }))
    setRoleStatus((s) => ({ ...s, [role]: result }))
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const allowed = { groq: parsed.groq.models, openrouter: parsed.openrouter.models, inception: parsed.inception.models }
      // A default that is no longer in the list falls back to the first model.
      const fixed = Object.fromEntries(CLOUD_PROVIDERS.map((id) => [id, allowed[id].includes(defaults[id]) ? defaults[id] : (allowed[id][0] ?? '')])) as Record<CloudProvider, string>
      await saveModelConfig({ allowed, defaults: fixed, roles })
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
      <div className="space-y-3 border-t border-ink-200 pt-4 dark:border-ink-800">
        <div>
          <h3 className="text-sm font-semibold">Pipeline roles</h3>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">In Auto mode, each of these three jobs is handled by one provider. Pick which provider plays each role, then test it on its own.</p>
        </div>
        {PIPELINE_ROLES.map((role) => (
          <div key={role} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <div>
              <label htmlFor={`role-${role}`} className="label">
                {ROLE_LABEL[role]}
              </label>
              <p className="mb-1 text-xs text-ink-500 dark:text-ink-400">{ROLE_HELP[role]}</p>
              <select id={`role-${role}`} className="input" value={roles[role]} onChange={(e) => { setRoles({ ...roles, [role]: e.target.value as CloudProvider }); setRoleStatus({ ...roleStatus, [role]: undefined }); setSaved(false) }}>
                {CLOUD_PROVIDERS.map((id) => (
                  <option key={id} value={id}>
                    {PROVIDERS[id].label.replace(/ \(.*\)/, '')}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn-secondary" disabled={!!roleTesting[role]} aria-label={`Test ${ROLE_LABEL[role]} connection`} onClick={() => void testRole(role)}>
              {roleTesting[role] ? (
                <>
                  <Spinner label="Testing" /> Testing...
                </>
              ) : (
                'Test connection'
              )}
            </button>
            {roleStatus[role] && (
              <div role="status" className={`rounded-lg border p-2 text-xs sm:col-span-3 ${roleStatus[role]!.ok ? 'border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-100' : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'}`}>
                <p className="flex items-center gap-1.5">{roleStatus[role]!.ok ? <IconCheck className="h-3.5 w-3.5 shrink-0" stroke={2.5} aria-hidden="true" /> : <IconX className="h-3.5 w-3.5 shrink-0" stroke={2.5} aria-hidden="true" />}{roleStatus[role]!.message}</p>
              </div>
            )}
          </div>
        ))}
      </div>
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
