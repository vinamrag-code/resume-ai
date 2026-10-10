import type { Provider, ServerConfig } from './config'

export interface ModelConfig {
  allowed: Record<Provider, string[]>
  defaults: Record<Provider, string>
}

type FetchLike = (url: string) => Promise<Response>
const MODEL_NAME = /^[\w./:@+-]{1,120}$/
const TTL_MS = 30_000

/** Firestore REST wraps every value in a type tag; unwrap the few shapes we use. */
function strings(v: unknown): string[] {
  const values = (v as { arrayValue?: { values?: { stringValue?: unknown }[] } } | undefined)?.arrayValue?.values ?? []
  return values.map((x) => x.stringValue).filter((s): s is string => typeof s === 'string' && MODEL_NAME.test(s)).slice(0, 20)
}
const str = (v: unknown): string | undefined => {
  const s = (v as { stringValue?: unknown } | undefined)?.stringValue
  return typeof s === 'string' && MODEL_NAME.test(s) ? s : undefined
}

/** Parse the admin's `config/models` document (Firestore REST format). Invalid entries are dropped. */
export function parseModelDoc(doc: unknown, env: ModelConfig): ModelConfig {
  const fields = (doc as { fields?: Record<string, unknown> } | null)?.fields
  if (!fields) return env
  const defaultsFields = (fields.defaults as { mapValue?: { fields?: Record<string, unknown> } } | undefined)?.mapValue?.fields ?? {}
  const out: ModelConfig = { allowed: { ...env.allowed }, defaults: { ...env.defaults } }
  for (const p of ['groq', 'openrouter'] as const) {
    const list = strings(fields[p])
    if (list.length) {
      out.allowed[p] = list
      const d = str(defaultsFields[p])
      out.defaults[p] = d && list.includes(d) ? d : list[0]!
    }
  }
  return out
}

/** Server defaults come from environment variables; the admin's Firestore document overrides them. */
export function envModels(cfg: Pick<ServerConfig, 'allowedModels'>): ModelConfig {
  return { allowed: cfg.allowedModels, defaults: { groq: cfg.allowedModels.groq[0]!, openrouter: cfg.allowedModels.openrouter[0]! } }
}

/**
 * Reads the model list the admin manages in Firestore (config/models, publicly readable because model
 * names are not secret) with a short cache. Falls back to the environment defaults if it cannot be read.
 */
export function createModelSource(cfg: ServerConfig, fetchImpl: FetchLike = fetch as FetchLike, now: () => number = Date.now) {
  const fallback = envModels(cfg)
  const { projectId, apiKey } = cfg.firebase
  let cache: { at: number; value: ModelConfig } | null = null
  return async function get(): Promise<ModelConfig> {
    if (!projectId || !apiKey) return fallback
    if (cache && now() - cache.at < TTL_MS) return cache.value
    let value = cache?.value ?? fallback
    try {
      const res = await fetchImpl(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/config/models?key=${encodeURIComponent(apiKey)}`)
      if (res.ok) value = parseModelDoc(await res.json(), fallback)
      else if (res.status === 404) value = fallback // no admin config yet
    } catch {
      /* keep the last good value */
    }
    cache = { at: now(), value }
    return value
  }
}
