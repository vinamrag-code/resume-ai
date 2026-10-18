import { getIdToken, useAuth } from '@/lib/auth/store'
import { canManageModels } from '@/lib/auth/useCanManageModels'
import { useSettings } from '@/store/settings'
import type { SettingsState } from '@/store/settings'
import { ChainLlmClient, LangChainClient } from '@/lib/chain'
import { OpenAiCompatibleClient } from './openai'
import { CLOUD_PROVIDERS, getServerProviders, PROVIDERS, resolveModel } from './providers'
import type { ProviderId } from './providers'
import type { LlmClient } from './types'

export * from './types'
export { generateJson, extractJson } from './json'
export { OpenAiCompatibleClient } from './openai'
export { LangChainClient } from '@/lib/chain'
export { PROVIDERS, CLOUD_PROVIDERS, loadServerProviders, getServerProviders, setServerProviders, getServerModels, setServerModels, resolveModel, subscribeServerProviders } from './providers'
export type { ProviderId, ProviderInfo } from './providers'

let override: LlmClient | null = null

/** Replace the client (used by tests). Pass null to reset. */
export function setLlmClient(client: LlmClient | null): void {
  override = client
}

type ClientSettings = Pick<SettingsState, 'provider' | 'models'>

function single(id: ProviderId, s: ClientSettings): LlmClient {
  const info = PROVIDERS[id]
  // Cloud models must be on the server's allowlist; otherwise the admin's default is used.
  const model = resolveModel(id, s.models[id])
  return new OpenAiCompatibleClient({
    baseUrl: info.baseUrl,
    model,
    getToken: getIdToken,
    label: info.label.replace(/ \(.*\)/, ''),
    supportsJsonFormat: info.supportsJsonFormat,
  })
}

/** Order of cloud providers in Auto mode: Groq is fastest, OpenRouter is the second opinion, Inception the last fallback. */
const AUTO_ORDER = CLOUD_PROVIDERS

export type LlmRole = 'primary' | 'checker'

/**
 * Build a client for the current settings.
 * - Auto, primary: the LangChain pipeline (see `ChainLlmClient`) when Inception is available: Groq improves the prompt,
 *   Inception writes, Groq polishes, OpenRouter stands behind each step. Otherwise Groq, then OpenRouter.
 * - Auto, checker: the providers rotated by one (OpenRouter, Inception, Groq), so fact-checks come from an
 *   independent model, falling back to the primary one.
 *   Only providers that have a key on the server are used (keys never reach the browser).
 * - A specific provider: used for everything.
 */
export function createLlm(s: ClientSettings, role: LlmRole = 'primary'): LlmClient {
  if (s.provider !== 'auto') return single(s.provider, s)
  // Until the server status is known, try all; a provider without a key answers 503 and Auto falls through.
  const known = getServerProviders()
  const available = AUTO_ORDER.filter((id) => !known || known.has(id))
  if (role === 'primary' && available.includes('inception')) {
    const openrouter = available.includes('openrouter') ? [single('openrouter', s)] : []
    return new ChainLlmClient({ editor: available.filter((id) => id !== 'inception').map((id) => single(id, s)), writer: [single('inception', s), ...openrouter] })
  }
  const ordered = role === 'checker' ? [...available.slice(1), ...available.slice(0, 1)] : available
  return new LangChainClient(ordered.map((id) => single(id, s)))
}

/** The app-wide LLM client, built from the current Settings. */
export function getLlm(role: LlmRole = 'primary'): LlmClient {
  if (override) return override
  const settings = useSettings.getState()
  // Members never choose a provider or model: they get Auto mode with the admin's default models,
  // whatever an older version of the app may have saved in this browser.
  if (!canManageModels(useAuth.getState())) return createLlm({ ...settings, provider: 'auto', models: {} }, role)
  return createLlm(settings, role)
}
