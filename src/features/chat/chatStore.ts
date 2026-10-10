import { create } from 'zustand'
import type { Change } from '@/lib/changes'

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  /** Raw model text, including any edits block. */
  content: string
  changes: Change[]
}

interface ChatState {
  byResume: Record<string, ChatTurn[]>
  set: (resumeId: string, fn: (turns: ChatTurn[]) => ChatTurn[]) => void
  clear: (resumeId: string) => void
}

/** Conversations are kept in memory only; they are not part of the saved data. */
export const useChats = create<ChatState>()((set) => ({
  byResume: {},
  set: (resumeId, fn) => set((s) => ({ byResume: { ...s.byResume, [resumeId]: fn(s.byResume[resumeId] ?? []) } })),
  clear: (resumeId) => set((s) => ({ byResume: { ...s.byResume, [resumeId]: [] } })),
}))
