import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PROVIDERS } from '@/lib/llm/providers'
import type { ProviderId } from '@/lib/llm/providers'

export type ThemePref = 'system' | 'light' | 'dark'

export interface SettingsState {
  provider: ProviderId
  ollamaUrl: string
  /** Model for the active provider. */
  model: string
  /** Last model used with each provider, restored when switching back. */
  models: Partial<Record<ProviderId, string>>
  setProvider: (p: ProviderId) => void
  setModel: (m: string) => void
  theme: ThemePref
  onboarded: boolean
  update: (patch: Partial<Pick<SettingsState, 'provider' | 'ollamaUrl' | 'model' | 'theme' | 'onboarded'>>) => void
}

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
export const DEFAULT_MODEL = 'llama3.1:8b'

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      provider: 'ollama',
      ollamaUrl: DEFAULT_OLLAMA_URL,
      model: DEFAULT_MODEL,
      models: {},
      theme: 'system',
      onboarded: false,
      update: (patch) => set(patch),
      setModel: (model) => set((s) => ({ model, models: { ...s.models, [s.provider]: model } })),
      setProvider: (provider) =>
        set((s) => {
          const models = { ...s.models, [s.provider]: s.model }
          return { provider, models, model: models[provider] ?? (provider === 'ollama' ? DEFAULT_MODEL : PROVIDERS[provider].defaultModel) }
        }),
    }),
    {
      name: 'resume-ai:settings',
      partialize: ({ provider, ollamaUrl, model, models, theme, onboarded }) => ({ provider, ollamaUrl, model, models, theme, onboarded }),
    },
  ),
)
