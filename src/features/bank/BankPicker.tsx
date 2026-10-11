import { Modal } from '@/components/ui'
import { entryFromItem } from '@/lib/bank/link'
import type { EntryKind } from '@/lib/bank/link'
import { useBank } from '@/store/bank'
import { BANK_KIND_LABELS } from '@/types/bank'
import type { Experience, Project } from '@/types/resume'

/** Choose items from the experience bank to add to a resume section (items already in it are hidden). */
export function BankPicker({ section, usedIds, onAdd, onClose }: { section: EntryKind; usedIds: string[]; onAdd: (entry: Experience | Project) => void; onClose: () => void }) {
  const items = useBank((s) => s.items).filter((i) => (section === 'experience' ? i.kind === 'work' : i.kind !== 'work') && !usedIds.includes(i.id))
  return (
    <Modal title={section === 'experience' ? 'Add a role from your experience bank' : 'Add a project or achievement from your experience bank'} onClose={onClose}>
      {items.length === 0 ? (
        <p className="text-sm text-ink-500">Nothing left to add. Store more in the Experience bank page.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink-200 p-2.5 dark:border-ink-700">
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">
                  {i.title}
                  {i.org && <span className="font-normal text-ink-500"> · {i.org}</span>}
                </p>
                <p className="text-xs text-ink-500">
                  {BANK_KIND_LABELS[i.kind]} · {i.bullets.length} bullet{i.bullets.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                className="btn-primary btn-sm shrink-0"
                aria-label={`Add ${i.title}`}
                onClick={() => {
                  onAdd(entryFromItem(i).entry)
                  onClose()
                }}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
