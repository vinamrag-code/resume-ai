import { useSettings } from '@/store/settings'
import { OllamaClient } from './ollama'
import { OpenAiCompatibleClient } from './openai'
import { envApiKey, PROVIDERS } from './providers'
import type { LlmClient } from './types'

export * from './types'
export { generateJson, extractJson } from './json'
export { OllamaClient, OLLAMA_HELP } from './ollama'
export { OpenAiCompatibleClient } from './openai'
export { PROVIDERS, envApiKey } from './providers'
export type { ProviderId, ProviderInfo } from './providers'

let override: LlmClient | null = null

/** Replace the client (used by tests). Pass null to reset. */
export function setLlmClient(client: LlmClient | null): void {
  override = client
}

/** Build a client for the given settings. */
export function createLlm(settings: { provider: keyof typeof PROVIDERS; ollamaUrl: string; model: string }): LlmClient {
  const info = PROVIDERS[settings.provider]
  if (settings.provider === 'ollama') return new OllamaClient({ baseUrl: settings.ollamaUrl, model: settings.model })
  return new OpenAiCompatibleClient({
    baseUrl: info.baseUrl,
    model: settings.model,
    apiKey: envApiKey(settings.provider),
    label: info.label.replace(/ \(.*\)/, ''),
    supportsJsonFormat: info.supportsJsonFormat,
  })
}

/** The app-wide LLM client, built from the current Settings. */
export function getLlm(): LlmClient {
  return override ?? createLlm(useSettings.getState())
}
