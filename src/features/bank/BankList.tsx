import { useState } from 'react'
import { EmptyState } from '@/components/ui'
import { bankDraftsFromResume } from '@/lib/bank/assemble'
import { useBank } from '@/store/bank'
import { useResumes } from '@/store/resumes'
import { BANK_KINDS, BANK_KIND_LABELS } from '@/types/bank'
import type { BankItem } from '@/types/bank'
import { BankItemModal } from './BankItemModal'

const dates = (i: BankItem) => [i.start, i.end].filter(Boolean).join(' - ')

function Row({ item, onEdit }: { item: BankItem; onEdit: () => void }) {
  const remove = useBank((s) => s.remove)
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="card flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            {item.title}
            {item.org && <span className="font-normal text-ink-500"> · {item.org}</span>}
          </h3>
          {dates(item) && <p className="text-xs text-ink-500">{dates(item)}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className="btn-secondary btn-sm" onClick={onEdit} aria-label={`Edit ${item.title}`}>
            Edit
          </button>
          {confirming ? (
            <button type="button" className="btn-danger btn-sm" onClick={() => remove(item.id)} onBlur={() => setConfirming(false)} autoFocus aria-label={`Confirm delete ${item.title}`}>
              Delete?
            </button>
          ) : (
            <button type="button" className="btn-danger btn-sm" onClick={() => setConfirming(true)} aria-label={`Delete ${item.title}`}>
              Delete
            </button>
          )}
        </div>
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-700 dark:text-ink-300">
        {item.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      {item.skills.length > 0 && <p className="text-xs text-ink-500">Skills: {item.skills.join(', ')}</p>}
    </li>
  )
}

/** Everything the user has stored, grouped by type, with add / edit / delete and a one-click import from existing resumes. */
export function BankList() {
  const items = useBank((s) => s.items)
  const resumes = useResumes((s) => s.resumes)
  const [editing, setEditing] = useState<BankItem | 'new' | null>(null)
  const [note, setNote] = useState('')

  const importAll = () => {
    const existing = [...useBank.getState().items]
    const drafts = resumes.flatMap((r) => {
      const fresh = bankDraftsFromResume(r.content, existing)
      existing.push(...fresh.map((d, i) => ({ ...d, id: `tmp-${r.id}-${i}`, createdAt: 0 })))
      return fresh
    })
    useBank.getState().addMany(drafts)
    setNote(drafts.length ? `Added ${drafts.length} item${drafts.length === 1 ? '' : 's'} from your resumes.` : 'Everything in your resumes is already in the bank.')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
          Add experience
        </button>
        <button type="button" className="btn-secondary" onClick={importAll} disabled={!resumes.length}>
          Import from my resumes
        </button>
        <span role="status" className="text-xs text-ink-500">
          {note}
        </span>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Your experience bank is empty">Add each project, job and achievement once, or import them from the resumes you already have. For every job you apply to, the best matches are picked for you.</EmptyState>
      ) : (
        BANK_KINDS.map((k) => {
          const group = items.filter((i) => i.kind === k)
          return (
            group.length > 0 && (
              <section key={k} aria-label={BANK_KIND_LABELS[k]}>
                <h2 className="mb-2 text-sm font-semibold text-ink-600 dark:text-ink-300">
                  {BANK_KIND_LABELS[k]} ({group.length})
                </h2>
                <ul className="grid gap-3 lg:grid-cols-2">
                  {group.map((i) => (
                    <Row key={i.id} item={i} onEdit={() => setEditing(i)} />
                  ))}
                </ul>
              </section>
            )
          )
        })
      )}
      {editing && <BankItemModal item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
