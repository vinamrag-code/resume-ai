import { draftFromEntry, inSync, pullFromBank, pushToBank } from '@/lib/bank/link'
import type { Entry } from '@/lib/bank/link'
import { useBank } from '@/store/bank'

/**
 * Shown on each Experience / Project entry: whether it matches its experience-bank item, with one-click
 * "update from bank" / "save to bank" so the resume and the bank can be edited from either side.
 */
export function BankLinkBar<T extends Entry>({ entry, onChange }: { entry: T; onChange: (next: T) => void }) {
  const item = useBank((s) => s.items.find((i) => i.id === entry.bankId))
  const chip = 'rounded-full px-2 py-0.5 text-xs'
  if (!entry.bankId || !item) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <span>{entry.bankId ? 'Its experience-bank item was deleted.' : 'Not in your experience bank.'}</span>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => {
            const made = useBank.getState().add(draftFromEntry(entry))
            onChange({ ...entry, bankId: made.id })
          }}
        >
          Save to experience bank
        </button>
      </div>
    )
  }
  const same = inSync(entry, item)
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={`${chip} ${same ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'}`}>{same ? 'Linked to experience bank' : 'Differs from experience bank'}</span>
      {!same && (
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={() => onChange(pullFromBank(entry, item))}>
            Update from bank
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => useBank.getState().update(item.id, pushToBank(entry))}>
            Save changes to bank
          </button>
        </>
      )}
      <button type="button" className="btn-ghost btn-sm" onClick={() => onChange({ ...entry, bankId: undefined })}>
        Unlink
      </button>
    </div>
  )
}
