import { getIdToken, useAuth } from '@/lib/auth/store'
import { canManageModels } from '@/lib/auth/useCanManageModels'
import { useSettings } from '@/store/settings'
import type { SettingsState } from '@/store/settings'
import { ChainLlmClient, LangChainClient } from '@/lib/chain'
import { OpenAiCompatibleClient } from './openai'
import { CLOUD_PROVIDERS, DEFAULT_ROLES, getServerModels, getServerProviders, PROVIDERS, resolveModel } from './providers'
import type { CloudProvider, ProviderId } from './providers'
import type { ConnectionStatus, LlmClient } from './types'

export * from './types'
export { generateJson, extractJson } from './json'
export { OpenAiCompatibleClient } from './openai'
export { LangChainClient } from '@/lib/chain'
export { PROVIDERS, CLOUD_PROVIDERS, PIPELINE_ROLES, DEFAULT_ROLES, loadServerProviders, getServerProviders, setServerProviders, getServerModels, setServerModels, resolveModel, subscribeServerProviders } from './providers'
export type { ProviderId, ProviderInfo, CloudProvider, PipelineRole, ServerModels } from './providers'

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

/** Natural order of cloud providers when no pipeline role applies: Groq, OpenRouter, Inception. */
const AUTO_ORDER = CLOUD_PROVIDERS
/** Each provider tried at most once, in order, skipping ones that are unavailable or already listed. */
const dedupeAvailable = (ids: CloudProvider[], avail: (id: CloudProvider) => boolean) => ids.filter((id, i, arr) => avail(id) && arr.indexOf(id) === i)

export type LlmRole = 'primary' | 'checker'

/**
 * Build a client for the current settings.
 * - Auto, primary: the LangChain pipeline (see `ChainLlmClient`) when the writer role's provider is available: the
 *   editor role rewrites the prompt and polishes, the writer role answers, each backed up by the fallback role.
 *   Otherwise every available provider is tried in order.
 * - Auto, checker: the fallback role goes first, then writer, then editor, so fact-checks come from an
 *   independent model, falling back to the primary one.
 *   Only providers that have a key on the server are used (keys never reach the browser).
 * - A specific provider: used for everything.
 */
export function createLlm(s: ClientSettings, role: LlmRole = 'primary'): LlmClient {
  if (s.provider !== 'auto') return single(s.provider, s)
  // Until the server status is known, try all; a provider without a key answers 503 and Auto falls through.
  const known = getServerProviders()
  const avail = (id: CloudProvider) => !known || known.has(id)
  const { writer, editor, fallback } = getServerModels()?.roles ?? DEFAULT_ROLES
  if (role === 'primary' && avail(writer)) {
    const editorChain = dedupeAvailable([editor, fallback], (id) => id !== writer && avail(id))
    const writerChain = dedupeAvailable([writer, fallback], avail)
    return new ChainLlmClient({ editor: editorChain.map((id) => single(id, s)), writer: writerChain.map((id) => single(id, s)) })
  }
  const ordered = role === 'checker' ? dedupeAvailable([fallback, writer, editor], avail) : AUTO_ORDER.filter(avail)
  return new LangChainClient(ordered.map((id) => single(id, s)))
}

/** Build a one-off client for a single provider and model, used to test a pipeline role's connection in the admin panel. */
export function createProviderLlm(id: CloudProvider, model: string): LlmClient {
  return single(id, { provider: id, models: { [id]: model } })
}

export async function testProviderConnection(id: CloudProvider, model: string): Promise<ConnectionStatus> {
  return createProviderLlm(id, model).testConnection()
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
