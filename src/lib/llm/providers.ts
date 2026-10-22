export type ProviderId = 'openrouter' | 'groq' | 'inception'

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
    baseUrl: `${import.meta.env.BASE_URL}api/llm/openrouter`,
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    supportsJsonFormat: false,
  },
  groq: {
    id: 'groq',
    label: 'Groq (cloud)',
    baseUrl: `${import.meta.env.BASE_URL}api/llm/groq`,
    defaultModel: 'openai/gpt-oss-120b',
    supportsJsonFormat: true,
  },
  inception: {
    id: 'inception',
    label: 'Inception (cloud)',
    baseUrl: `${import.meta.env.BASE_URL}api/llm/inception`,
    defaultModel: 'mercury-2.5',
    supportsJsonFormat: true,
  },
}

export type CloudProvider = 'groq' | 'openrouter' | 'inception'
export const CLOUD_PROVIDERS: CloudProvider[] = ['groq', 'openrouter', 'inception']

/**
 * The three jobs in the Auto-mode pipeline: `writer` generates the answer, `editor` rewrites the prompt and
 * polishes the draft, `fallback` backs up both and goes first when an independent checker is needed.
 */
export type PipelineRole = 'writer' | 'editor' | 'fallback'
export const PIPELINE_ROLES: PipelineRole[] = ['writer', 'editor', 'fallback']
export const DEFAULT_ROLES: Record<PipelineRole, CloudProvider> = { writer: 'inception', editor: 'groq', fallback: 'openrouter' }

/** Which cloud providers have a key on the server. `null` until the status request finishes. */
let serverProviders: Set<CloudProvider> | null = null
/** Models the server allows per provider, the admin's default for each, and which provider plays which pipeline role. */
export interface ServerModels {
  allowed: Record<CloudProvider, string[]>
  defaults: Record<CloudProvider, string>
  roles?: Record<PipelineRole, CloudProvider>
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

const isValidRoles = (r: unknown): r is Record<PipelineRole, CloudProvider> =>
  !!r && typeof r === 'object' && PIPELINE_ROLES.every((role) => CLOUD_PROVIDERS.includes((r as Record<string, unknown>)[role] as CloudProvider))

/** Ask the server which providers it has keys for (the keys themselves are never sent). */
export async function loadServerProviders(): Promise<Set<CloudProvider>> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/llm/status`)
    const data = (await res.json()) as { providers?: Partial<Record<CloudProvider, boolean>>; models?: Partial<Record<CloudProvider, string[]>>; defaults?: Partial<Record<CloudProvider, string>>; roles?: unknown }
    if (data.models && data.defaults && CLOUD_PROVIDERS.every((id) => Array.isArray(data.models?.[id]) && typeof data.defaults?.[id] === 'string')) {
      serverModels = { allowed: data.models as ServerModels['allowed'], defaults: data.defaults as ServerModels['defaults'], roles: isValidRoles(data.roles) ? data.roles : undefined }
    }
    setServerProviders(new Set(CLOUD_PROVIDERS.filter((id) => data.providers?.[id])))
  } catch {
    setServerProviders(new Set())
  }
  return serverProviders ?? new Set()
}

