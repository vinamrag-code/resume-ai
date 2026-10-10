import { useSettings } from '@/store/settings'
import type { SettingsState } from '@/store/settings'
import { FallbackClient } from './fallback'
import { OllamaClient } from './ollama'
import { OpenAiCompatibleClient } from './openai'
import { CLOUD_PROVIDERS, getServerProviders, PROVIDERS } from './providers'
import type { ProviderId } from './providers'
import type { LlmClient } from './types'

export * from './types'
export { generateJson, extractJson } from './json'
export { OllamaClient, OLLAMA_HELP } from './ollama'
export { OpenAiCompatibleClient } from './openai'
export { FallbackClient } from './fallback'
export { PROVIDERS, CLOUD_PROVIDERS, loadServerProviders, getServerProviders, setServerProviders, subscribeServerProviders } from './providers'
export type { ProviderId, ProviderInfo } from './providers'

let override: LlmClient | null = null

/** Replace the client (used by tests). Pass null to reset. */
export function setLlmClient(client: LlmClient | null): void {
  override = client
}

type ClientSettings = Pick<SettingsState, 'provider' | 'ollamaUrl' | 'models'>

function single(id: ProviderId, s: ClientSettings): LlmClient {
  const info = PROVIDERS[id]
  const model = s.models[id] || info.defaultModel
  if (id === 'ollama') return new OllamaClient({ baseUrl: s.ollamaUrl, model })
  return new OpenAiCompatibleClient({
    baseUrl: info.baseUrl,
    model,
    label: info.label.replace(/ \(.*\)/, ''),
    supportsJsonFormat: info.supportsJsonFormat,
  })
}

/** Order of cloud providers in Auto mode: Groq is fastest, OpenRouter is the second opinion. */
const AUTO_ORDER = CLOUD_PROVIDERS

export type LlmRole = 'primary' | 'checker'

/**
 * Build a client for the current settings.
 * - Auto: primary = Groq then OpenRouter as fallback; checker = the *other* provider first, so
 *   fact-checks come from an independent model, falling back to the primary one.
 *   Only providers that have a key on the server are used (keys never reach the browser).
 * - A specific provider: used for everything.
 */
export function createLlm(s: ClientSettings, role: LlmRole = 'primary'): LlmClient {
  if (s.provider !== 'auto') return single(s.provider, s)
  // Until the server status is known, try both; a provider without a key answers 503 and Auto falls through.
  const known = getServerProviders()
  const available = AUTO_ORDER.filter((id) => !known || known.has(id))
  const ordered = role === 'checker' ? [...available].reverse() : available
  return new FallbackClient(ordered.map((id) => single(id, s)))
}

/** The app-wide LLM client, built from the current Settings. */
export function getLlm(role: LlmRole = 'primary'): LlmClient {
  return override ?? createLlm(useSettings.getState(), role)
}
