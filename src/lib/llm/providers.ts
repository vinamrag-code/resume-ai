export type ProviderId = 'ollama' | 'openrouter' | 'groq'

/** What the user picks in Settings: Auto uses Groq first with OpenRouter as fallback and checker. */
export type ProviderChoice = ProviderId | 'auto'

export interface ProviderInfo {
  id: ProviderId
  label: string
  /** Base URL for OpenAI-compatible providers (Ollama's is configurable in Settings). */
  baseUrl: string
  defaultModel: string
  /** Name of the `.env` variable holding the API key (none for Ollama). */
  envKey?: string
  /** True if the provider honours `response_format: json_object`. */
  supportsJsonFormat: boolean
  /** Prompts and resume text leave this computer when the provider is used. */
  cloud: boolean
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  ollama: { id: 'ollama', label: 'Ollama (local, advanced)', baseUrl: 'http://localhost:11434', defaultModel: 'llama3.1:8b', supportsJsonFormat: true, cloud: false },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (cloud)',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    envKey: 'VITE_OPENROUTER_API_KEY',
    supportsJsonFormat: false,
    cloud: true,
  },
  groq: {
    id: 'groq',
    label: 'Groq (cloud)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    envKey: 'VITE_GROQ_API_KEY',
    supportsJsonFormat: true,
    cloud: true,
  },
}

/** API keys come from `.env` (Vite exposes VITE_* vars to the browser bundle). */
export function envApiKey(id: ProviderId): string {
  const env = import.meta.env as Record<string, string | undefined>
  const name = PROVIDERS[id].envKey
  return (name ? env[name] : undefined)?.trim() ?? ''
}

/** Cloud providers that have an API key in .env. */
export function configuredCloudProviders(): ProviderId[] {
  return (['groq', 'openrouter'] as const).filter((id) => envApiKey(id) !== '')
}
