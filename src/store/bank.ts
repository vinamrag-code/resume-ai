import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { makeId } from '@/lib/id'
import type { BankItem } from '@/types/bank'

export type BankDraft = Omit<BankItem, 'id' | 'createdAt' | 'updatedAt'>

interface BankState {
  items: BankItem[]
  add: (draft: BankDraft) => BankItem
  addMany: (drafts: BankDraft[]) => BankItem[]
  update: (id: string, patch: Partial<BankDraft>) => void
  remove: (id: string) => void
}

/** The experience bank: everything the user has done, stored once. Saved in this browser and synced like the rest. */
export const useBank = create<BankState>()(
  persist(
    (set) => {
      const make = (d: BankDraft, now: number): BankItem => ({ ...d, id: makeId(), createdAt: now })
      return {
        items: [],
        add: (draft) => {
          const item = make(draft, Date.now())
          set((s) => ({ items: [item, ...s.items] }))
          return item
        },
        addMany: (drafts) => {
          const now = Date.now()
          const made = drafts.map((d) => make(d, now))
          set((s) => ({ items: [...made, ...s.items] }))
          return made
        },
        update: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i)) })),
        remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      }
    },
    { name: 'resume-ai:bank', partialize: (s) => ({ items: s.items }) },
  ),
)
