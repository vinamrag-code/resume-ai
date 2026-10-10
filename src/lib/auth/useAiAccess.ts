import { useSettings } from '@/store/settings'
import { canUseAi, useAuth } from './store'

/** Whether AI actions are available now. Local Ollama needs no sign-in; hosted AI does when the server requires it. */
export function useAiAccess(): boolean {
  const provider = useSettings((s) => s.provider)
  const allowed = useAuth(canUseAi)
  return provider === 'ollama' || allowed
}
