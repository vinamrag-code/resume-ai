import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PROVIDERS } from '@/lib/llm/providers'
import type { ProviderChoice, ProviderId } from '@/lib/llm/providers'

export type ThemePref = 'light' | 'dark'

export type ModelChoices = Partial<Record<ProviderId, string>>

/** Only explicit choices are stored. Cloud models start empty so they follow the admin's default. */
export function defaultModels(): ModelChoices {
  return {}
}

export interface SettingsState {
  /** "auto" = Groq first, then OpenRouter (also the fact-checker), then Inception. */
  provider: ProviderChoice
  /** Models the user picked themselves (cloud providers are empty until they choose one). */
  models: ModelChoices
  theme: ThemePref
  onboarded: boolean
  setProvider: (p: ProviderChoice) => void
  setModel: (id: ProviderId, model: string) => void
  /** Forget the user's choice so the provider's default (set by the admin) applies. */
  clearModel: (id: ProviderId) => void
  update: (patch: Partial<Pick<SettingsState, 'theme' | 'onboarded'>>) => void
  /** Used by backup restore. */
  restore: (s: Pick<SettingsState, 'provider' | 'theme'> & { models?: ModelChoices }) => void
}

/** Used once, to turn a saved 'system' theme into a fixed one. */
const prefersDark = () => !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      provider: 'auto',
      models: defaultModels(),
      theme: 'light',
      onboarded: false,
      setProvider: (provider) => set({ provider }),
      setModel: (id, model) => set((s) => ({ models: { ...s.models, [id]: model } })),
      clearModel: (id) => set((s) => ({ models: Object.fromEntries(Object.entries(s.models).filter(([k]) => k !== id)) as ModelChoices })),
      update: (patch) => set(patch),
      restore: (s) => set((cur) => ({ provider: s.provider, theme: s.theme, models: { ...cur.models, ...s.models } })),
    }),
    {
      name: 'resume-ai:settings',
      version: 6, // 5: a provider chosen in another build of the app (e.g. Inception) is reset to Auto; 6: the 'system' theme is gone, so it becomes whatever the OS prefers now
      partialize: ({ provider, models, theme, onboarded }) => ({ provider, models, theme, onboarded }),
      // Older versions saved the built-in cloud defaults as if the user had chosen them, which would stop an
      // admin's default from applying. Keep only models that differ from those built-ins. A saved
      // provider this version does not know (e.g. one since removed) becomes Auto.
      migrate: (old) => {
        const o = (old ?? {}) as { provider?: string; models?: ModelChoices; theme?: string; onboarded?: boolean }
        const kept = Object.fromEntries(Object.entries(o.models ?? {}).filter(([id, m]) => id in PROVIDERS && m !== PROVIDERS[id as ProviderId].defaultModel)) as ModelChoices
        const provider = o.provider === 'auto' || (o.provider && o.provider in PROVIDERS) ? (o.provider as ProviderChoice) : 'auto'
        return { provider, models: { ...defaultModels(), ...kept }, theme: o.theme === 'dark' || o.theme === 'light' ? o.theme : prefersDark() ? 'dark' : 'light', onboarded: o.onboarded ?? false } as SettingsState
      },
    },
  ),
)
