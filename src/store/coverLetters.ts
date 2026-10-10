import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { makeId } from '@/lib/id'
import type { CoverLetter } from '@/types/job'

export interface CoverLetterState {
  letters: CoverLetter[]
  add: (input: Omit<CoverLetter, 'id' | 'createdAt' | 'updatedAt'>) => CoverLetter
  update: (id: string, patch: Partial<Omit<CoverLetter, 'id'>>) => void
  remove: (id: string) => void
}

export const useCoverLetters = create<CoverLetterState>()(
  persist(
    (set) => ({
      letters: [],
      add: (input) => {
        const now = Date.now()
        const letter: CoverLetter = { ...input, id: makeId(), createdAt: now, updatedAt: now }
        set((s) => ({ letters: [letter, ...s.letters] }))
        return letter
      },
      update: (id, patch) =>
        set((s) => ({ letters: s.letters.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: Date.now() } : l)) })),
      remove: (id) => set((s) => ({ letters: s.letters.filter((l) => l.id !== id) })),
    }),
    { name: 'resume-ai:letters', partialize: (s) => ({ letters: s.letters }) },
  ),
)
