import { useSettings } from '@/store/settings'
import { OllamaClient } from './ollama'
import type { LlmClient } from './types'

export * from './types'
export { generateJson, extractJson } from './json'
export { OllamaClient, OLLAMA_HELP } from './ollama'

let override: LlmClient | null = null

/** Replace the client (used by tests, or to plug in another provider). Pass null to reset. */
export function setLlmClient(client: LlmClient | null): void {
  override = client
}

/** The app-wide LLM client, built from the current Settings. */
export function getLlm(): LlmClient {
  if (override) return override
  const { ollamaUrl, model } = useSettings.getState()
  return new OllamaClient({ baseUrl: ollamaUrl, model })
}
