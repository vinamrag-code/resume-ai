export type ProviderId = 'ollama' | 'openrouter' | 'groq'

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
  ollama: { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434', defaultModel: 'llama3.1:8b', supportsJsonFormat: true, cloud: false },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (cloud)',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    envKey: 'VITE_OPENROUTER_API_KEY',
    supportsJsonFormat: false,
    cloud: true,
  },
  groq: {
    id: 'groq',
    label: 'Groq (cloud)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
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
