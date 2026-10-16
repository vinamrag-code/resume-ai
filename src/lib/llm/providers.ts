export type ProviderId = 'openrouter' | 'groq'

/** What the user picks in Settings: Auto uses Groq first with OpenRouter as fallback and checker. */
export type ProviderChoice = ProviderId | 'auto'

export interface ProviderInfo {
  id: ProviderId
  label: string
  /** Base URL: the server proxy path (keys stay on the server). */
  baseUrl: string
  defaultModel: string
  /** True if the provider honours `response_format: json_object`. */
  supportsJsonFormat: boolean
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (cloud)',
    baseUrl: '/api/llm/openrouter',
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    supportsJsonFormat: false,
  },
  groq: {
    id: 'groq',
    label: 'Groq (cloud)',
    baseUrl: '/api/llm/groq',
    defaultModel: 'openai/gpt-oss-120b',
    supportsJsonFormat: true,
  },
}

export type CloudProvider = 'groq' | 'openrouter'
export const CLOUD_PROVIDERS: CloudProvider[] = ['groq', 'openrouter']

/** Which cloud providers have a key on the server. `null` until the status request finishes. */
let serverProviders: Set<CloudProvider> | null = null
/** Models the server allows per provider, and the admin's default for each. `null` until known. */
export interface ServerModels {
  allowed: Record<CloudProvider, string[]>
  defaults: Record<CloudProvider, string>
}
let serverModels: ServerModels | null = null
const listeners = new Set<() => void>()

export function getServerProviders(): Set<CloudProvider> | null {
  return serverProviders
}
export function setServerProviders(p: Set<CloudProvider> | null): void {
  serverProviders = p
  listeners.forEach((l) => l())
}
export function getServerModels(): ServerModels | null {
  return serverModels
}
export function setServerModels(m: ServerModels | null): void {
  serverModels = m
  listeners.forEach((l) => l())
}
/** The model to use for a provider: the user's choice if the server allows it, otherwise the admin's default. */
export function resolveModel(id: CloudProvider, chosen: string | undefined): string {
  const allowed = serverModels?.allowed[id]
  if (!allowed) return chosen || PROVIDERS[id].defaultModel
  if (chosen && allowed.includes(chosen)) return chosen
  return serverModels?.defaults[id] ?? allowed[0] ?? PROVIDERS[id].defaultModel
}
export function subscribeServerProviders(l: () => void): () => void {
  listeners.add(l)
  return () => void listeners.delete(l)
}

/** Ask the server which providers it has keys for (the keys themselves are never sent). */
export async function loadServerProviders(): Promise<Set<CloudProvider>> {
  try {
    const res = await fetch('/api/llm/status')
    const data = (await res.json()) as { providers?: Partial<Record<CloudProvider, boolean>>; models?: Partial<Record<CloudProvider, string[]>>; defaults?: Partial<Record<CloudProvider, string>> }
    if (data.models && data.defaults && CLOUD_PROVIDERS.every((id) => Array.isArray(data.models?.[id]) && typeof data.defaults?.[id] === 'string')) {
      serverModels = { allowed: data.models as ServerModels['allowed'], defaults: data.defaults as ServerModels['defaults'] }
    }
    setServerProviders(new Set(CLOUD_PROVIDERS.filter((id) => data.providers?.[id])))
  } catch {
    setServerProviders(new Set())
  }
  return serverProviders ?? new Set()
}

