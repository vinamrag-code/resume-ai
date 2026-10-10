import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PROVIDERS } from '@/lib/llm/providers'
import type { ProviderChoice, ProviderId } from '@/lib/llm/providers'

export type ThemePref = 'system' | 'light' | 'dark'

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

export function defaultModels(): Record<ProviderId, string> {
  return { ollama: PROVIDERS.ollama.defaultModel, openrouter: PROVIDERS.openrouter.defaultModel, groq: PROVIDERS.groq.defaultModel }
}

export interface SettingsState {
  /** "auto" = Groq first, OpenRouter as fallback and fact-checker. */
  provider: ProviderChoice
  ollamaUrl: string
  models: Record<ProviderId, string>
  theme: ThemePref
  onboarded: boolean
  setProvider: (p: ProviderChoice) => void
  setModel: (id: ProviderId, model: string) => void
  update: (patch: Partial<Pick<SettingsState, 'ollamaUrl' | 'theme' | 'onboarded'>>) => void
  /** Used by backup restore. */
  restore: (s: Pick<SettingsState, 'provider' | 'ollamaUrl' | 'theme'> & { models?: Partial<Record<ProviderId, string>> }) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      provider: 'auto',
      ollamaUrl: DEFAULT_OLLAMA_URL,
      models: defaultModels(),
      theme: 'system',
      onboarded: false,
      setProvider: (provider) => set({ provider }),
      setModel: (id, model) => set((s) => ({ models: { ...s.models, [id]: model } })),
      update: (patch) => set(patch),
      restore: (s) => set((cur) => ({ provider: s.provider, ollamaUrl: s.ollamaUrl, theme: s.theme, models: { ...cur.models, ...s.models } })),
    }),
    {
      name: 'resume-ai:settings',
      version: 2,
      partialize: ({ provider, ollamaUrl, models, theme, onboarded }) => ({ provider, ollamaUrl, models, theme, onboarded }),
      // v1 stored a single `model` and defaulted to Ollama; move everyone to Auto.
      migrate: (old) => {
        const o = (old ?? {}) as { ollamaUrl?: string; model?: string; theme?: ThemePref; onboarded?: boolean }
        return { provider: 'auto', ollamaUrl: o.ollamaUrl ?? DEFAULT_OLLAMA_URL, models: { ...defaultModels(), ...(o.model ? { ollama: o.model } : {}) }, theme: o.theme ?? 'system', onboarded: false } as SettingsState
      },
    },
  ),
)
