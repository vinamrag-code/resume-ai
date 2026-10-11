import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { chatIdFor } from '@/types/chat'
import type { Chat, ChatTurn } from '@/types/chat'

/** Keep conversations a sensible size: the newest turns, each capped in length. */
export const MAX_TURNS = 60
export const MAX_TURN_CHARS = 20_000

export function trimTurns(turns: ChatTurn[]): ChatTurn[] {
  return turns.slice(-MAX_TURNS).map((t) => (t.content.length > MAX_TURN_CHARS ? { ...t, content: t.content.slice(0, MAX_TURN_CHARS) } : t))
}

interface ChatsState {
  chats: Chat[]
  /** Update the conversation for a resume (creating it on first use). */
  setTurns: (resumeId: string, fn: (turns: ChatTurn[]) => ChatTurn[]) => void
  /** Delete the saved conversation for a resume. */
  clear: (resumeId: string) => void
}

/** Agent conversations, saved per resume in this browser and synced to the account like the rest of the data. */
export const useChats = create<ChatsState>()(
  persist(
    (set) => ({
      chats: [],
      setTurns: (resumeId, fn) =>
        set((s) => {
          const now = Date.now()
          const existing = s.chats.find((c) => c.resumeId === resumeId)
          const turns = trimTurns(fn(existing?.turns ?? []))
          if (!existing) return { chats: [{ id: chatIdFor(resumeId), resumeId, turns, createdAt: now, updatedAt: now }, ...s.chats] }
          return { chats: s.chats.map((c) => (c.resumeId === resumeId ? { ...c, turns, updatedAt: now } : c)) }
        }),
      clear: (resumeId) => set((s) => ({ chats: s.chats.filter((c) => c.resumeId !== resumeId) })),
    }),
    { name: 'resume-ai:chats', partialize: (s) => ({ chats: s.chats }) },
  ),
)

/** Saved turns for a resume, ignoring an assistant reply that was cut off before any text arrived. */
export function selectTurns(chats: Chat[], resumeId: string): ChatTurn[] | undefined {
  return chats.find((c) => c.resumeId === resumeId)?.turns
}
