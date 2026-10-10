import { useId } from 'react'
import type { ReactNode } from 'react'
import { moveItem, removeAt, replaceAt } from '@/lib/arrays'

export function TextField({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} type={type} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function AreaField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <textarea id={id} rows={rows} className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function RowControls({ index, count, label, onMove, onRemove }: { index: number; count: number; label: string; onMove: (to: number) => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 gap-1" role="group" aria-label={`${label} actions`}>
      <button type="button" className="btn-ghost btn-sm" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Move ${label} up`}>
        ↑
      </button>
      <button type="button" className="btn-ghost btn-sm" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`Move ${label} down`}>
        ↓
      </button>
      <button type="button" className="btn-danger btn-sm" onClick={onRemove} aria-label={`Remove ${label}`}>
        Remove
      </button>
    </div>
  )
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Generic ordered list of entries with add / remove / reorder. */
export function EntryList<T>({
  title,
  noun,
  items,
  onChange,
  makeEmpty,
  renderTitle,
  render,
}: {
  title: string
  noun: string
  items: T[]
  onChange: (items: T[]) => void
  makeEmpty: () => T
  renderTitle: (item: T, index: number) => string
  render: (item: T, update: (next: T) => void) => ReactNode
}) {
  return (
    <Section
      title={title}
      action={
        <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...items, makeEmpty()])}>
          Add {noun}
        </button>
      }
    >
      {items.length === 0 && <p className="text-sm text-ink-500 dark:text-ink-400">No {title.toLowerCase()} yet.</p>}
      {items.map((item, i) => {
        const label = `${noun} ${i + 1}`
        return (
          <div key={i} className="space-y-3 rounded-lg border border-ink-200 p-3 dark:border-ink-700">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-medium">{renderTitle(item, i) || `Untitled ${noun}`}</h3>
              <RowControls index={i} count={items.length} label={label} onMove={(to) => onChange(moveItem(items, i, to))} onRemove={() => onChange(removeAt(items, i))} />
            </div>
            {render(item, (next) => onChange(replaceAt(items, i, next)))}
          </div>
        )
      })}
    </Section>
  )
}

/** Editable list of bullet strings. */
export function BulletsEditor({ label, bullets, onChange }: { label: string; bullets: string[]; onChange: (b: string[]) => void }) {
  return (
    <div>
      <p className="label">{label}</p>
      <ul className="space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2">
            <textarea aria-label={`${label} ${i + 1}`} rows={2} className="input" value={b} onChange={(e) => onChange(replaceAt(bullets, i, e.target.value))} />
            <RowControls index={i} count={bullets.length} label={`${label.toLowerCase()} ${i + 1}`} onMove={(to) => onChange(moveItem(bullets, i, to))} onRemove={() => onChange(removeAt(bullets, i))} />
          </li>
        ))}
      </ul>
      <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => onChange([...bullets, ''])}>
        Add bullet
      </button>
    </div>
  )
}
