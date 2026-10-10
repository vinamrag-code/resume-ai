import { useSettings } from '@/store/settings'
import { canUseAi, useAuth } from './store'
import { useCanManageModels } from './useCanManageModels'

/** Whether AI actions are available now. Local Ollama needs no sign-in; hosted AI does when the server requires it. */
export function useAiAccess(): boolean {
  const provider = useSettings((s) => s.provider)
  const allowed = useAuth(canUseAi)
  const canManage = useCanManageModels()
  // Local Ollama is a model choice, so it is only for people who can manage models.
  return (provider === 'ollama' && canManage) || allowed
}
