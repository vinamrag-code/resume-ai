import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PROVIDERS } from '@/lib/llm/providers'
import type { ProviderChoice, ProviderId } from '@/lib/llm/providers'

export type ThemePref = 'system' | 'light' | 'dark'

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

export type ModelChoices = Partial<Record<ProviderId, string>>

/** Only explicit choices are stored. Cloud models start empty so they follow the admin's default. */
export function defaultModels(): ModelChoices {
  return { ollama: PROVIDERS.ollama.defaultModel }
}

export interface SettingsState {
  /** "auto" = Groq first, OpenRouter as fallback and fact-checker. */
  provider: ProviderChoice
  ollamaUrl: string
  /** Models the user picked themselves (cloud providers are empty until they choose one). */
  models: ModelChoices
  theme: ThemePref
  onboarded: boolean
  setProvider: (p: ProviderChoice) => void
  setModel: (id: ProviderId, model: string) => void
  /** Forget the user's choice so the provider's default (set by the admin) applies. */
  clearModel: (id: ProviderId) => void
  update: (patch: Partial<Pick<SettingsState, 'ollamaUrl' | 'theme' | 'onboarded'>>) => void
  /** Used by backup restore. */
  restore: (s: Pick<SettingsState, 'provider' | 'ollamaUrl' | 'theme'> & { models?: ModelChoices }) => void
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
      clearModel: (id) => set((s) => ({ models: Object.fromEntries(Object.entries(s.models).filter(([k]) => k !== id)) as ModelChoices })),
      update: (patch) => set(patch),
      restore: (s) => set((cur) => ({ provider: s.provider, ollamaUrl: s.ollamaUrl, theme: s.theme, models: { ...cur.models, ...s.models } })),
    }),
    {
      name: 'resume-ai:settings',
      version: 3,
      partialize: ({ provider, ollamaUrl, models, theme, onboarded }) => ({ provider, ollamaUrl, models, theme, onboarded }),
      // Older versions saved the built-in cloud defaults as if the user had chosen them, which would stop an
      // admin's default from applying. Keep only models that differ from those built-ins.
      migrate: (old) => {
        const o = (old ?? {}) as { provider?: ProviderChoice; ollamaUrl?: string; model?: string; models?: ModelChoices; theme?: ThemePref; onboarded?: boolean }
        const kept = Object.fromEntries(Object.entries(o.models ?? {}).filter(([id, m]) => id === 'ollama' || (id in PROVIDERS && m !== PROVIDERS[id as ProviderId].defaultModel))) as ModelChoices
        return { provider: o.provider ?? 'auto', ollamaUrl: o.ollamaUrl ?? DEFAULT_OLLAMA_URL, models: { ...defaultModels(), ...kept, ...(o.model && !o.models ? { ollama: o.model } : {}) }, theme: o.theme ?? 'system', onboarded: o.onboarded ?? false } as SettingsState
      },
    },
  ),
)
