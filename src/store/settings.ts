import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePref = 'system' | 'light' | 'dark'

export interface SettingsState {
  ollamaUrl: string
  model: string
  theme: ThemePref
  onboarded: boolean
  update: (patch: Partial<Pick<SettingsState, 'ollamaUrl' | 'model' | 'theme' | 'onboarded'>>) => void
}

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
export const DEFAULT_MODEL = 'llama3.1:8b'

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ollamaUrl: DEFAULT_OLLAMA_URL,
      model: DEFAULT_MODEL,
      theme: 'system',
      onboarded: false,
      update: (patch) => set(patch),
    }),
    {
      name: 'resume-ai:settings',
      partialize: ({ ollamaUrl, model, theme, onboarded }) => ({ ollamaUrl, model, theme, onboarded }),
    },
  ),
)
