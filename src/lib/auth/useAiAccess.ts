import { canUseAi, useAuth } from './store'

/** Whether AI actions are available now (signed in and verified when the server requires it). */
export function useAiAccess(): boolean {
  return useAuth(canUseAi)
}
